# python3 build.py  -> dist/catalogue.html (single file, everything inlined)
import os
here = os.path.dirname(os.path.abspath(__file__))
src = lambda *p: open(os.path.join(here, *p)).read()
parts = {'ENGINE':'src/engine.js','DOOR':'src/contraptions/door.js','SCENES':'src/contraptions/scenes.js','PLAQUE':'src/contraptions/plaque.js',
         'HIDDEN':'src/contraptions/hidden.js','LAUNCHER':'src/contraptions/launcher.js','LOGIC':'src/contraptions/logic.js','CATALOGUE':'src/catalogue.js','RENDER':'src/render.js',
         'CATAPP':'pages/catalogue-app.js'}
os.makedirs(os.path.join(here,'dist'), exist_ok=True)
for name, tpl in [('catalogue.html','pages/catalogue.html')]:
    t = src(tpl)
    for k, f in parts.items(): t = t.replace('/*%s*/' % k, src(f))
    open(os.path.join(here,'dist',name),'w').write(t); print('built dist/' + name, len(t)//1024, 'KB')
