"""
Rebuild `models/isnet-w8.onnx` — the background-removal model behind strip backdrops.

Source: `isnet-general-use.onnx` from the rembg project's release
(https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx),
itself an export of IS-Net "general use" weights from DIS
(https://github.com/xuebinqin/DIS, Apache-2.0).

Two changes, nothing else:

1. **Pruned to the one output we read.** The export also emits the five side outputs
   and six decoder feature maps used in training; dropping them skips their final
   upsample-to-1024 work on every run.
2. **Weight-only uint8, per output channel.** Each Conv weight becomes a uint8 tensor
   plus a `DequantizeLinear`, so activations stay float32. That quarters the download
   (178 MB → 46.5 MB) and — unlike `quantize_dynamic`'s ConvInteger — is an op the
   WebGPU execution provider runs itself instead of handing back to the CPU. Measured
   against the float model: mean abs diff 1.9e-5 on the mask, max 0.033.

The input stays fixed at 1x3x1024x1024: the graph's internal Resize/Concat shapes are
baked for it, and every smaller size tried fails in stage 1.

    python3 -m venv .venv && .venv/bin/pip install onnx numpy
    .venv/bin/python scripts/build-segmentation-model.py isnet-general-use.onnx
"""

import sys

import numpy as np
import onnx
import onnx.utils
from onnx import helper, numpy_helper

SOURCE = sys.argv[1] if len(sys.argv) > 1 else 'isnet-general-use.onnx'
PRUNED = 'isnet-pruned.onnx'
OUTPUT = 'models/isnet-w8.onnx'

onnx.utils.extract_model(SOURCE, PRUNED, ['input_image'], ['output_image'])

model = onnx.load(PRUNED)
graph = model.graph
initializers = {init.name: init for init in graph.initializer}
conv_weights = {node.input[1] for node in graph.node if node.op_type == 'Conv'}

dequantize = []
for name in sorted(conv_weights):
    weight = numpy_helper.to_array(initializers[name]).astype(np.float32)
    channels = weight.shape[0]
    flat = weight.reshape(channels, -1)
    # Asymmetric per-channel range that always contains zero, so zero stays exact.
    low = np.minimum(flat.min(1), 0)
    high = np.maximum(flat.max(1), 0)
    scale = np.maximum((high - low) / 255.0, 1e-12).astype(np.float32)
    zero = np.clip(np.round(-low / scale), 0, 255).astype(np.uint8)
    quantized = np.clip(np.round(flat / scale[:, None]) + zero[:, None], 0, 255)
    quantized = quantized.astype(np.uint8).reshape(weight.shape)

    graph.initializer.remove(initializers[name])
    graph.initializer.extend(
        [
            numpy_helper.from_array(quantized, f'{name}_q'),
            numpy_helper.from_array(scale, f'{name}_s'),
            numpy_helper.from_array(zero, f'{name}_z'),
        ]
    )
    dequantize.append(
        helper.make_node(
            'DequantizeLinear', [f'{name}_q', f'{name}_s', f'{name}_z'], [name], axis=0
        )
    )

nodes = dequantize + list(graph.node)
del graph.node[:]
graph.node.extend(nodes)

onnx.checker.check_model(model)
onnx.save(model, OUTPUT)
print(f'wrote {OUTPUT}')
