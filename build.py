# python3 build.py  -> dist/catalogue.html (single file, everything inlined) and dist/redstone.js (embeddable bundle)
import os
here = os.path.dirname(os.path.abspath(__file__))
src = lambda *p: open(os.path.join(here, *p)).read()
parts = {'ENGINE':'src/engine.js','DOOR':'src/contraptions/door.js','SCENES':'src/contraptions/scenes.js','PLAQUE':'src/contraptions/plaque.js',
         'HIDDEN':'src/contraptions/hidden.js','LAUNCHER':'src/contraptions/launcher.js','PISTONDOOR':'src/contraptions/pistondoor.js','LOGIC':'src/contraptions/logic.js',
         'CATALOGUE':'src/catalogue.js','RENDER':'src/render.js','CATAPP':'pages/catalogue-app.js'}
os.makedirs(os.path.join(here,'dist'), exist_ok=True)
for name, tpl in [('catalogue.html','pages/catalogue.html')]:
    t = src(tpl)
    for k, f in parts.items(): t = t.replace('/*%s*/' % k, src(f))
    open(os.path.join(here,'dist',name),'w').write(t); print('built dist/' + name, len(t)//1024, 'KB')
# Library bundle for other pages: the same files the catalogue inlines, minus the site code, concatenated in load order.
# Exposes RS (engine), Logic, Scenes, the build* functions, Catalogue and RSR (renderer) on window.
js = '// redstone: engine, contraptions, catalogue and renderer. <script src="redstone.js"></script>\n' + '\n'.join(src(f) for k, f in parts.items() if k != 'CATAPP')
open(os.path.join(here,'dist','redstone.js'),'w').write(js); print('built dist/redstone.js', len(js)//1024, 'KB')
