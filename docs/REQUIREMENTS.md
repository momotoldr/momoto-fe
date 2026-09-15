# Real-Time Virtual Photobooth — Frontend Requirements

## 1. Background

This web application is the client-side interface for a synchronized virtual photobooth. It allows users to join a shared digital "room," view each other via live webcams, and take synchronized four-cut photo strips together in real-time. 

The frontend is responsible for requesting camera permissions, rendering video streams, handling the user interface (creating/joining rooms), and using the HTML5 Canvas API to capture, compose, and download the final photo strip.

## 2. Objectives

1. **Initialize Frontend Setup** — Set up a modern React-based (TypeScript) single-page application using Vite, Tailwind CSS, and Shadcdn for rapid UI development.
2. **Media & Canvas Processing** — Implement logic to access local webcams, stream peer video feeds, and capture specific video frames to a hidden canvas element at exact timestamps.
3. **Socket Integration** — Integrate a WebSocket client to listen for room events (e.g., "start countdown") and trigger the local camera capture simultaneously with peers.

## 3. End-State Vision

### Target technology stack (Frontend)

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| Build Tool | Vite | Fast HMR, optimized production builds. |
| Language | TypeScript | Type safety for complex real-time socket events and media streams. |
| Framework | React 18 | Component-driven architecture for managing media streams and UI. |
| Routing | React Router v6 | Declarative routing for navigating between the home page and active rooms. |
| State Management| Zustand | Lightweight global state for managing room data, user media streams, and captured photos. |
| UI Components | Tailwind CSS + Shadcdn | Fast, accessible, and customizable UI components for a modern look. |
| Real-Time Client| Socket.io-client | Listening to and emitting room events to the backend. |
| Media Streaming | WebRTC (PeerJS) | Direct peer-to-peer video streaming so users can see each other live. |
| Media Processing| HTML5 Canvas API | Native browser API for capturing video frames and rendering the final image. |
| Linting | ESLint + Prettier | Code consistency and formatting enforcement. |

## 4. Workstreams

Build the new React application with the following functionality:

- **Landing Page** — A homepage with actions to "Create a Room" and "Join with a Code".
- **Digital Booth (Room UI)** — The core interface where users see their own webcam feed and the feed(s) of connected peers. Includes controls for camera/microphone and a "Start Session" button.
- **Countdown & UI Sync** — Visual and audio countdown (e.g., 3-2-1) that triggers based on Socket.io events.
- **Capture & Canvas Engine** — Logic to silently capture the current `<video>` frame to a hidden `<canvas>` at the exact moment the countdown hits zero, repeating 4 times.
- **Photo Composition & Download** — A final screen that stitches the captured frames onto a vertical canvas with a custom background, and provides a button to download the resulting PNG file.

## 5. Success Criteria

| Criteria | Measurement |
| :--- | :--- |
| **Media Reliability** | Webcam streams load successfully upon granting browser permissions, and P2P connections display without freezing. |
| **Capture Accuracy** | The canvas engine correctly grabs frames exactly at the end of the synchronized countdown. |
| **Image Generation** | The final stitched photo strip renders correctly at native webcam resolution without stretching or distortion. |