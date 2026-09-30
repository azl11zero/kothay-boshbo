# 🍴 Kothay Boshbo (কোথায় বসবো)

> **Find your next bite — Curated cafes & restaurants across Dhaka, Bangladesh.**

[![Live Website](https://img.shields.io/badge/Live_Site-kothay--boshbo.onrender.com-brightgreen?style=for-the-badge&logo=render)](https://kothay-boshbo.onrender.com)
[![LinkedIn](https://img.shields.io/badge/Created_by-Azmaeen_Fayek-0077B5?style=for-the-badge&logo=linkedin)](https://www.linkedin.com/in/md-azmaeen-fayek-a871aa276/?isSelfProfile=true)

---

## 🌐 Live Application
- **Production URL**: [https://kothay-boshbo.onrender.com](https://kothay-boshbo.onrender.com)
- **API Health Endpoint**: [https://kothay-boshbo.onrender.com/api/health](https://kothay-boshbo.onrender.com/api/health)

---

## ✨ Features

- **12 Curated Dhaka Neighborhoods**:
  - Mirpur (Sections 1, 10, 11, 12), Dhanmondi, Gulshan 1 & 2, Banani, Shantinagar, Khilgaon, Bashundhara R/A, and Uttara.
- **1,167+ Verified Dhaka Listings**:
  - Full details including Google Maps directions, star ratings, review counts, addresses, and signature cuisine tags.
- **Default Sort by Most Reviews**:
  - Instantly highlights the most popular, high-traffic spots first.
- **Interactive Leaflet & Esri Map**:
  - Dynamic clustering, smooth fly-to animations, custom pins, and zero watermarks.
- **Mobile-First Experience**:
  - Airbnb-style floating toggle bar between **List view** and **Map view**.
  - Bidirectional synchronization between horizontal scroll pills and native Area dropdown.
- **Instant Search & Smart Area Auto-Switch**:
  - Search by venue name, cuisine, road, or area with instant filtering.
- **Bookmark & Favorites**:
  - Save places locally (persisted via `localStorage`).

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3, [Leaflet.js](https://leafletjs.com/), [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster), Clarity City Web Font.
- **Backend**: [Node.js](https://nodejs.org/), [Express 5](https://expressjs.com/), [Compression](https://www.npmjs.com/package/compression).
- **Security & Firewall**: [Helmet](https://helmetjs.github.io/) (Content Security Policy tailored for ArcGIS & Google CDN assets), HSTS, HPP, IP Rate Limiting.
- **Deployment**: [Render](https://render.com/), Cloudflare CDN.

---

## 🚀 Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/azl11zero/kothay-boshbo.git
   cd kothay-boshbo
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the local server**:
   ```bash
   npm start
   ```

4. **Open in browser**:
   ```
   http://localhost:8080
   ```

---

## 👨‍💻 Author

Created with ❤️ by **[Md Azmaeen Fayek](https://www.linkedin.com/in/md-azmaeen-fayek-a871aa276/?isSelfProfile=true)**.
