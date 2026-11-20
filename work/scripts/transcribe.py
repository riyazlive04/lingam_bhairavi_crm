import os, sys, json, glob, time, concurrent.futures as cf, urllib.request, uuid
root = sys.argv[1]
key = [l.split('=',1)[1].strip() for l in open(os.path.join(root,'.env.local')) if l.startswith('SARVAM_API_KEY')][0]
files = sorted(glob.glob(os.path.join(root,'work','audio','chunk_*.wav')))
def post(path, url, extra):
    b = uuid.uuid4().hex
    body = b''
    for k,v in extra.items():
        body += f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    body += f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="a.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode() + open(path,'rb').read() + f'\r\n--{b}--\r\n'.encode()
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, data=body, headers={'api-subscription-key':key,'Content-Type':f'multipart/form-data; boundary={b}'})
            return json.loads(urllib.request.urlopen(req, timeout=120).read())
        except Exception as e:
            err = getattr(e,'read',lambda:b'')().decode(errors='ignore')
            print('retry', os.path.basename(path), e, err[:200], file=sys.stderr); time.sleep(3*(attempt+1))
    return {}
def work(p):
    en = post(p,'https://api.sarvam.ai/speech-to-text-translate',{'model':'saaras:v2.5'})
    orig = post(p,'https://api.sarvam.ai/speech-to-text',{'model':'saarika:v2.5','language_code':'unknown'})
    return p, en, orig
out = {}
with cf.ThreadPoolExecutor(4) as ex:
    for p,en,orig in ex.map(work, files):
        out[os.path.basename(p)] = (en, orig)
md = ['# Meeting Transcript\n']
for i,(n,(en,orig)) in enumerate(sorted(out.items())):
    s=i*25; ts=f'{s//60:02d}:{s%60:02d}'
    md.append(f'**[{ts}]** EN: {en.get("transcript","")}\n\n> Original ({orig.get("language_code","?")}): {orig.get("transcript","")}\n')
open(os.path.join(root,'work','transcript_raw.md'),'w',encoding='utf-8').write('\n'.join(md))
print('done', sum(1 for v in out.values() if v[0].get('transcript')), 'of', len(files))
