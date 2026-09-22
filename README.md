# WallRush 11x11 Realtime Multiplayer Board Game

A high-aesthetic, 11x11 realtime multiplayer strategy board game inspired by WallRush. Built with **HTML5, Vanilla CSS, JavaScript**, and **Supabase Realtime (Broadcast & Presence)**, optimized for **100% Free Vercel Deployment (No Credit Card Required)**.

---

## 🌟 Key Features

- **11x11 Board & 3D Marble Spheres**: Glowing multi-color perimeter edges, glossy 3D spheres, and pulsing golden center goal `(5, 5)`.
- **Client-Side BFS Pathfinding (`js/pathfinding.js`)**: Realtime path validation guaranteeing wall placements never block any player's path to `(5, 5)`.
- **Unique Lobby Colors**: Choose your marble color in the waiting room lobby. Colors claimed by other players display a **✕ mark** in real time.
- **Card-Free WebSockets**: Powered by Supabase Realtime Broadcast & Presence with local `BroadcastChannel` fallback.
- **In-App Toast System**: Sleek glassmorphism UI error banners without native browser alert popups.
- **Vercel Ready**: Built for static zero-cost deployment on Vercel.

---

## 🚀 Quick Start (Local Development)

1. Clone the repository:
   ```bash
   git clone https://github.com/T-EmmanuelLevinne/wallniLeEm.git
   ```
2. Open `index.html` in your browser or run a local static server:
   ```bash
   python -m http.server 8080
   ```
3. Open `http://localhost:8080` in two browser tabs to test multiplayer!

---

## 📦 Vercel Deployment

1. Push to your GitHub repository.
2. Import the project into **[Vercel](https://vercel.com/)**.
3. Click **Deploy**!
