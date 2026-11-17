# Building Budget Book from source

The website files at the top of this repository are **built** from this `source` folder.
You only need this if you want to change the app.

## Web app
```bash
cd source
npm install            # installs jsPDF, jspdf-autotable, qrcode-generator, the Sinhala font, supabase-js and jsQR
python3 build.py       # writes the finished site into source/dist/
```
Copy everything from `source/dist/` to the top of the repository, but keep your own filled-in `config.js`.

## Windows installer
1. Copy `source/dist` to `source/desktop/web` (leave out the `supabase` folder).
2. Run `cd source/desktop && npm i -D electron@33 electron-builder@25 resedit@2`, then `npx electron-builder --win --x64 --dir`.
3. Run `node seticon.js "out/win-unpacked/Budget Book.exe"` to set the icon and version details.
4. Compile `installer.nsi` with NSIS (`makensis installer.nsi`). This produces `out/Budget_Book_Setup_<version>.exe`.

`source/brand/` holds the icon artwork (SVG master plus PNG and ICO sizes).
