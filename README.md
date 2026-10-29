# Telepromptify

A free, private teleprompter with camera recording and color grading. It runs in your browser and installs as an Android app. Nothing is uploaded.

**Live:** https://telepromptify.vercel.app

## Features

- **Script editor:** word count and estimated read time, autosaved on your device
- **Import:** .txt, .docx and .pdf files, read locally (10 MB limit)
- **Teleprompter:** speed, font size, side margin, mirror text, background dim, countdown timer, tap a word to jump, drag to scrub
- **Recording:** record, pause and resume, then save the video to your device
- **Color grading:** Natural, Warm, Cool, Cinematic and Mono presets, plus brightness, contrast, saturation and warmth. The look is baked into the recording on Chrome for Android
- **Camera settings:** front or back camera, 720p or 1080p, mirror preview, grid, and zoom and light where the phone supports them
- **PWA:** installable, works offline, and can be packaged for Google Play

## Privacy

No accounts, ads, analytics or cookies. Your script and settings stay in your browser's local storage. Recordings never leave your device. See the [Privacy Policy](https://telepromptify.vercel.app/privacy.html) and [Terms](https://telepromptify.vercel.app/terms.html).

## Project structure

```
index.html            App shell (editor, stage, review, settings)
css/styles.css        All styles
js/main.js            Wires everything together
js/prompter.js        Scroll engine and text position
js/camera.js          Camera access and recording
js/grading.js         Color grading presets and filters
js/storage.js         Local settings and script storage
js/importer.js        .txt, .docx and .pdf import
vendor/               Bundled mammoth and pdf.js (no CDN)
sw.js                 Service worker (offline)
manifest.webmanifest  PWA manifest
vercel.json           Security headers for Vercel
privacy.html          Privacy Policy
terms.html            Terms of Use
```

## Run locally

It's a static site with no build step. Camera access needs HTTPS or localhost.

```bash
npx serve .
```

Then open http://localhost:3000.

## Deploy

Push to GitHub and import the repo in Vercel. Use the "Other" framework preset with no build command and the root directory as the output.

## Browser support

Chrome and Edge on Android and desktop are fully supported. Safari records without the color grade. Recordings save as WebM on most Android builds.

## License

All Rights Reserved