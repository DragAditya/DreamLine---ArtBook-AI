
# DreamLines: AI Coloring Book Generator 🎨✨

A high-end web application that uses **Google Gemini 3 Pro** to generate custom, high-quality coloring books for children. 

## Features

- **Personalized Adventures**: Enter a child's name and a theme (e.g., "Space Pirates", "Cyberpunk Forest") to generate a cohesive story.
- **Gemini 3 Pro Thinking Mode**: Uses advanced reasoning to design logically consistent visual scenes for the coloring book.
- **High-Quality Line Art**: Utilizes `gemini-3-pro-image-preview` for crisp, high-resolution (up to 2K) black-and-white coloring pages.
- **Export Options**: 
  - **Print to PDF**: Optimized layout for physical printing.
  - **Download ZIP**: Get individual image files.
- **AI Assistant**: A floating chat widget to help brainstorm themes and art styles.
- **History Tracking**: Saves your last 3 projects locally.

## Deployment on Render

1. **New Static Site**: Connect your GitHub repository to Render.
2. **Build Settings**:
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist` (or the folder containing your `index.html` after build).
3. **API Key**: The application uses the `window.aistudio` key selection flow. For production, ensure you follow the instructions in the app to connect a paid Google Cloud project.

## Tech Stack

- **Framework**: React 19
- **Styling**: Tailwind CSS
- **AI Models**: 
  - `gemini-3-pro-preview` (Story Logic)
  - `gemini-3-flash-preview` (Assistant/Suggestions)
  - `gemini-3-pro-image-preview` (Art Generation)
- **Utilities**: JSZip for file bundling.

## Guidelines

- Requires a Google Gemini API Key from a paid GCP project for high-quality image generation.
- Optimized for Chrome and modern mobile browsers.
