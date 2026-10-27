/**
 * The promo cards' illustrations (docs/PLAN-promos.md §5a), from the mockup "Momoto promo
 * cards". Drawn from Momoto's own art rather than stock icons: the stickers (heart,
 * sparkle, star — the same paths as `assets/stickers`), the strip templates (hearts,
 * classic) and the pink-gingham scrapbook. Inline and a few KB each — the sticker files
 * themselves run to hundreds of KB.
 *
 * Decorative: the card's text says everything, so each is `aria-hidden`.
 */

const HEART = 'M50 86C50 86 12 61 12 35a22 22 0 0 1 38-15 22 22 0 0 1 38 15c0 26-38 51-38 51Z'
const SPARKLE = 'M50 6C54 32 68 46 94 50 68 54 54 68 50 94 46 68 32 54 6 50 32 46 46 32 50 6Z'
const STAR = 'M50 8 61 38 93 38 67 58 77 89 50 70 23 89 33 58 7 38 39 38Z'
/** A person in a photo cell: head and shoulders. */
const SHOULDERS = 'c1-4 4-5.5 6-5.5s5 1.5 6 5.5z'

/** One photo cell: frame, photo, and (optionally) the person in it. */
function Cell({
  y,
  frame,
  photo,
  person,
  inset = 2,
}: {
  y: number
  frame: string
  photo: string
  person?: string
  inset?: number
}) {
  return (
    <>
      <rect x="3" y={y} width="26" height="19" rx="2" fill={frame} />
      <rect
        x={3 + inset}
        y={y + inset}
        width={26 - inset * 2}
        height={19 - inset * 2}
        rx="1.5"
        fill={photo}
      />
      {person && (
        <>
          <circle cx="16" cy={y + 8} r="3" fill={person} />
          <path d={`M10 ${y + 17}${SHOULDERS}`} fill={person} />
        </>
      )}
    </>
  )
}

const CELL_Y = [3, 25, 47, 69]

/** A 4-cut strip in the "hearts" template's pink, as a 32×96 group. */
function HeartsStrip({ photos }: { photos: [string, string | undefined][] }) {
  return (
    <>
      <rect width="32" height="96" rx="3" fill="#ffe3ee" />
      {photos.map(([photo, person], i) => (
        <Cell key={i} y={CELL_Y[i] ?? 0} frame="#ffffff" photo={photo} person={person} />
      ))}
    </>
  )
}

/** The "classic" template: cream paper, charcoal frames. */
function ClassicStrip({ photos }: { photos: [string, string | undefined][] }) {
  return (
    <>
      <rect width="32" height="96" rx="3" fill="#fffdf9" stroke="#e7e1d6" strokeWidth="1" />
      {photos.map(([photo, person], i) => (
        <Cell
          key={i}
          y={CELL_Y[i] ?? 0}
          frame="#2b2b2b"
          photo={photo}
          person={person}
          inset={1.5}
        />
      ))}
    </>
  )
}

/** Pink washi tape, as on the gingham scrapbook's pages. */
function Washi({ x, y, rotate }: { x: number; y: number; rotate: number }) {
  return (
    <g transform={`rotate(${rotate} ${x + 11} ${y + 4.5})`}>
      <rect x={x} y={y} width="22" height="9" fill="#f4a9ba" opacity="0.9" />
      {[4, 10, 16].map((dx) => (
        <rect key={dx} x={x + dx} y={y} width="2.5" height="9" fill="#ffffff" opacity="0.5" />
      ))}
    </g>
  )
}

const svgProps = {
  width: 140,
  height: 104,
  viewBox: '0 0 140 104',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true,
  focusable: false,
} as const

/** Partner promo: two strips leaning on each other, taped, with a heart between. */
export function PartnerArt({ className }: { className?: string }) {
  return (
    <svg {...svgProps} className={className}>
      <circle cx="78" cy="58" r="46" fill="#ffffff" opacity="0.55" />
      <g transform="translate(36 22) rotate(-12 16 48)">
        <HeartsStrip
          photos={[
            ['#fbcfe8', '#f9a8d4'],
            ['#fde68a', '#fbbf24'],
            ['#bae6fd', '#7dd3fc'],
            ['#fbcfe8', undefined],
          ]}
        />
      </g>
      <g transform="translate(74 18) rotate(10 16 48)">
        <HeartsStrip
          photos={[
            ['#bbf7d0', '#86efac'],
            ['#fbcfe8', '#f9a8d4'],
            ['#fde68a', '#fbbf24'],
            ['#bae6fd', undefined],
          ]}
        />
      </g>
      <Washi x={40} y={16} rotate={-8} />
      <Washi x={81} y={13} rotate={12} />
      <g transform="translate(57 30) scale(0.28)">
        <path d={HEART} fill="#ef4444" stroke="#ffffff" strokeWidth="8" />
      </g>
      <g transform="translate(110 4) scale(0.2)">
        <path d={SPARKLE} fill="#a855f7" />
      </g>
      <g transform="translate(22 66) scale(0.13)">
        <path d={SPARKLE} fill="#f472b6" />
      </g>
    </svg>
  )
}

/** Reward ready: two strips, one of them free, under a "+1" star sticker. */
export function ReadyArt({ className }: { className?: string }) {
  return (
    <svg {...svgProps} className={className}>
      <circle cx="76" cy="58" r="46" fill="#ffffff" opacity="0.55" />
      <g transform="translate(40 18) rotate(-7 16 48)">
        <ClassicStrip
          photos={[
            ['#fde68a', '#f59e0b'],
            ['#bae6fd', '#38bdf8'],
            ['#fbcfe8', '#f472b6'],
            ['#bbf7d0', undefined],
          ]}
        />
      </g>
      <g transform="translate(76 22) rotate(8 16 48)">
        <HeartsStrip
          photos={[
            ['#fbcfe8', '#f9a8d4'],
            ['#bbf7d0', '#86efac'],
            ['#fde68a', undefined],
            ['#bae6fd', undefined],
          ]}
        />
      </g>
      <g transform="translate(82 2) rotate(-10 22 22)">
        <path
          transform="scale(0.44)"
          d={STAR}
          fill="#facc15"
          stroke="#ffffff"
          strokeWidth="7"
          strokeLinejoin="round"
        />
        <text
          x="22"
          y="28"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="12"
          fontWeight="900"
          fill="#7c2d12"
        >
          +1
        </text>
      </g>
      <g transform="translate(26 70) scale(0.14)">
        <path d={SPARKLE} fill="#a855f7" />
      </g>
    </svg>
  )
}

/** A small strip for the scrapbook art: 18×54, four cells. */
function MiniStrip({ paper, frame, photos }: { paper: string; frame?: string; photos: string[] }) {
  return (
    <>
      <rect
        width="18"
        height="54"
        rx="2"
        fill={paper}
        stroke={frame ? '#e7e1d6' : undefined}
        strokeWidth={frame ? 0.8 : undefined}
      />
      {photos.map((photo, i) =>
        frame ? (
          <g key={i}>
            <rect x="2" y={2 + i * 13} width="14" height="11" rx="1" fill={frame} />
            <rect x="3" y={3 + i * 13} width="12" height="9" fill={photo} />
          </g>
        ) : (
          <rect key={i} x="2" y={2 + i * 13} width="14" height="11" rx="1" fill={photo} />
        )
      )}
    </>
  )
}

/** Bundle: an open pink-gingham scrapbook with three strips fanned out of it. */
export function BundleArt({ className }: { className?: string }) {
  return (
    <svg {...svgProps} className={className}>
      <circle cx="74" cy="56" r="46" fill="#ffffff" opacity="0.6" />
      <g transform="translate(38 10) rotate(-20 9 30)">
        <MiniStrip paper="#ffe3ee" photos={['#fbcfe8', '#fde68a', '#bae6fd', '#fbcfe8']} />
      </g>
      <g transform="translate(64 2)">
        <MiniStrip
          paper="#fffdf9"
          frame="#2b2b2b"
          photos={['#bbf7d0', '#fde68a', '#fbcfe8', '#bae6fd']}
        />
      </g>
      <g transform="translate(90 8) rotate(18 9 30)">
        <MiniStrip paper="#ffe3ee" photos={['#bae6fd', '#fbcfe8', '#bbf7d0', '#fde68a']} />
      </g>
      {/* Left page: pink gingham. */}
      <path d="M22 60 L72 54 L72 104 L22 104 Z" fill="#fdf0f2" />
      <g opacity="0.45" fill="#f19fb2">
        {[26, 36, 46, 56, 66].map((x, i) => (
          <rect key={x} x={x} y={58 - i} width="5" height={46 + i} />
        ))}
        <path d="M22 66 L72 60 L72 65 L22 71 Z" />
        <path d="M22 78 L72 72 L72 77 L22 83 Z" />
        <path d="M22 90 L72 84 L72 89 L22 95 Z" />
      </g>
      {/* Right page: lined notes. */}
      <path d="M72 54 L122 60 L122 104 L72 104 Z" fill="#fffdf9" />
      <g stroke="#e7d9c4" strokeWidth="1.2">
        <path d="M80 66 L114 70" />
        <path d="M80 74 L114 78" />
        <path d="M80 82 L114 86" />
        <path d="M80 90 L104 93" />
      </g>
      <path d="M72 54 L72 104" stroke="#d6c7b0" strokeWidth="1.5" />
      <Washi x={86} y={57} rotate={-6} />
      <g transform="translate(112 6) scale(0.22)">
        <path d={STAR} fill="#facc15" stroke="#ffffff" strokeWidth="8" strokeLinejoin="round" />
      </g>
      <g transform="translate(20 22) scale(0.16)">
        <path d={HEART} fill="#ef4444" />
      </g>
    </svg>
  )
}

const miniProps = {
  width: 52,
  height: 52,
  viewBox: '0 0 52 52',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true,
  focusable: false,
} as const

/** `BundleArt` at the checkout bar's size: the open gingham book with strips fanned out. */
export function BundleMiniArt({ className }: { className?: string }) {
  return (
    <svg {...miniProps} className={className}>
      <g transform="translate(9 5) rotate(-18 4 14)">
        <rect width="9" height="27" rx="1.5" fill="#ffe3ee" />
        <rect x="1" y="1" width="7" height="5.5" fill="#fbcfe8" />
        <rect x="1" y="7.5" width="7" height="5.5" fill="#fde68a" />
        <rect x="1" y="14" width="7" height="5.5" fill="#bae6fd" />
      </g>
      <g transform="translate(21 1)">
        <rect width="9" height="27" rx="1.5" fill="#fffdf9" stroke="#e7e1d6" strokeWidth="0.6" />
        <rect x="1" y="1" width="7" height="5.5" fill="#2b2b2b" />
        <rect x="1.6" y="1.6" width="5.8" height="4.3" fill="#bbf7d0" />
        <rect x="1" y="7.5" width="7" height="5.5" fill="#2b2b2b" />
        <rect x="1.6" y="8.1" width="5.8" height="4.3" fill="#fde68a" />
      </g>
      <g transform="translate(33 4) rotate(18 4 14)">
        <rect width="9" height="27" rx="1.5" fill="#ffe3ee" />
        <rect x="1" y="1" width="7" height="5.5" fill="#bae6fd" />
        <rect x="1" y="7.5" width="7" height="5.5" fill="#fbcfe8" />
      </g>
      <path d="M4 30 L26 27 L26 52 L4 52 Z" fill="#fdf0f2" />
      <g opacity="0.45" fill="#f19fb2">
        <rect x="7" y="29" width="3" height="23" />
        <rect x="13" y="28.5" width="3" height="23.5" />
        <rect x="19" y="28" width="3" height="24" />
      </g>
      <path d="M26 27 L48 30 L48 52 L26 52 Z" fill="#fffdf9" />
      <g stroke="#e7d9c4" strokeWidth="0.8">
        <path d="M30 34 L45 36" />
        <path d="M30 39 L45 41" />
        <path d="M30 44 L41 45.5" />
      </g>
    </svg>
  )
}

/** `ReadyArt` at the checkout bar's size: two strips under the "+1" star. */
export function ReadyMiniArt({ className }: { className?: string }) {
  return (
    <svg {...miniProps} className={className}>
      <g transform="translate(9 10) rotate(-7 7 21)">
        <rect width="14" height="42" rx="2" fill="#fffdf9" stroke="#e7e1d6" strokeWidth="0.6" />
        {[
          [1.5, '#fde68a'],
          [11.5, '#bae6fd'],
          [21.5, '#fbcfe8'],
        ].map(([y, photo]) => (
          <g key={y}>
            <rect x="1.5" y={y} width="11" height="8.5" fill="#2b2b2b" />
            <rect x="2.2" y={Number(y) + 0.7} width="9.6" height="7.1" fill={String(photo)} />
          </g>
        ))}
      </g>
      <g transform="translate(25 12) rotate(8 7 21)">
        <rect width="14" height="42" rx="2" fill="#ffe3ee" />
        <rect x="1.5" y="1.5" width="11" height="8.5" rx="1" fill="#fbcfe8" />
        <rect x="1.5" y="11.5" width="11" height="8.5" rx="1" fill="#bbf7d0" />
        <rect x="1.5" y="21.5" width="11" height="8.5" rx="1" fill="#fde68a" />
      </g>
      <g transform="translate(28 1) rotate(-10 11 11)">
        <path
          transform="scale(0.22)"
          d={STAR}
          fill="#facc15"
          stroke="#ffffff"
          strokeWidth="7"
          strokeLinejoin="round"
        />
        <text
          x="11"
          y="14.5"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="7"
          fontWeight="900"
          fill="#7c2d12"
        >
          +1
        </text>
      </g>
    </svg>
  )
}
