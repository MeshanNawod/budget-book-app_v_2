import base64,shutil,os
r=lambda p:open(p,encoding='utf-8').read()
b=lambda p:base64.b64encode(open(p,'rb').read()).decode()
t=r('src/index.tpl.html')
F='node_modules/@fontsource/noto-sans-sinhala/files/noto-sans-sinhala-sinhala-%s-normal.woff2'
rep={'/*F400*/':b(F%400),'/*F700*/':b(F%700),'/*CSS*/':r('src/style.css'),
 '/*JSPDF*/':r('node_modules/jspdf/dist/jspdf.umd.min.js'),
 '/*AUTOTABLE*/':r('node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js'),
 '/*QR*/':r('node_modules/qrcode-generator/qrcode.js'),'/*BOOK*/':r('src/book.js'),'/*APP*/':r('src/app.js'),'/*TICKETS*/':r('src/tickets.js'),'/*SUPABASE*/':r('node_modules/@supabase/supabase-js/dist/umd/supabase.js'),'/*JSQR*/':r('node_modules/jsqr/dist/jsQR.js')}
for k,v in rep.items(): t=t.replace(k,v.replace('</script','<\\/script'),1)
os.makedirs('dist/icons',exist_ok=True)
open('dist/index.html','w',encoding='utf-8').write(t)
shutil.rmtree('dist/icons',ignore_errors=True); os.makedirs('dist/icons')
for s in (32,180,192,512): shutil.copy(f'brand/icon-{s}.png',f'dist/icons/icon-{s}.png')
for s in (192,512): shutil.copy(f'brand/maskable-{s}.png',f'dist/icons/maskable-{s}.png')
shutil.copy('brand/icon.svg','dist/icons/icon.svg'); shutil.copy('brand/icon.ico','dist/favicon.ico')
open('dist/manifest.json','w').write('''{"name":"Budget Book","short_name":"Budget Book","description":"Record transactions and print a complete budget book. Data stays on your device.","start_url":"./","scope":"./","display":"standalone","background_color":"#f5f4f2","theme_color":"#7A1F2B","icons":[{"src":"icons/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any"},{"src":"icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any"},{"src":"icons/maskable-192.png","sizes":"192x192","type":"image/png","purpose":"maskable"},{"src":"icons/maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]}''')
if not os.path.exists('dist/config.js'): open('dist/config.js','w').write('''// Ticketing connection. Fill these in after following HOSTING.md, then upload this file to your website.
window.BB_CONFIG = {
  supabaseUrl: '',   // e.g. 'https://abcdefgh.supabase.co'
  supabaseKey: '',   // the "anon public" key from Supabase > Project Settings > API
  siteUrl: ''        // e.g. 'https://yourname.github.io/budget-book/'  (leave empty to use the current address)
};
''')
open('dist/sw.js','w').write('''const C='budgetbook-v3',F=['./','index.html','config.js','manifest.json','favicon.ico','icons/icon-32.png','icons/icon-192.png','icons/icon-512.png','icons/icon-180.png','icons/maskable-192.png','icons/maskable-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('index.html'))))});''')
for f in ('HOSTING.md','README.md'): shutil.copy(f,'dist/'+f)
shutil.rmtree('dist/supabase',ignore_errors=True); shutil.copytree('supabase','dist/supabase')
print(len(t)//1024,'KB')
