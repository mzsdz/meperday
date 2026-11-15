"""Build the searchable, offline Korean food catalogue from the official XLSX.
Usage: python scripts/import-foods.py path/to/food-db.xlsx
Source: MFDS K-FCDB food DB, 2026-08-28 release. Keep blanks unknown.
Only mass-based (100g) rows are imported; never equate 100mL with 100g.
"""
import json, re, sys, zipfile, xml.etree.ElementTree as ET
from pathlib import Path
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
columns={'carb':'W','protein':'T','fat':'U','fiber':'Y','calcium':'Z','iron':'AA','vitD':'AL','vitC':'AK','potassium':'AC','sodium':'AD','satFat':'AN','sugars':'X','cholesterol':'AM','vitA':'AE','vitE':'AZ','vitK':'BI','vitB1':'AH','vitB2':'AI','vitB6':'AS','vitB12':'AT','folate':'AU','niacin':'AJ','magnesium':'DN','zinc':'DS','phosphorus':'AB','selenium':'DR','iodine':'DU'}
def number(value):
    try:
        n=float(value)
        return n if 0<=n<=100000 else None
    except (ValueError,TypeError): return None
with zipfile.ZipFile(sys.argv[1]) as z:
    strings=[''.join(e.itertext()) for e in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si',ns)]
    output=[];seen=set()
    for event,row in ET.iterparse(z.open('xl/worksheets/sheet1.xml'),events=['end']):
        if row.tag!='{'+ns['m']+'}row': continue
        values={}
        for cell in row:
            v=cell.find('m:v',ns);value=v.text if v is not None else ''
            values[re.sub(r'\d','',cell.attrib['r'])]=strings[int(value)] if cell.attrib.get('t')=='s' and value else value
        row.clear()
        if values.get('Q')!='100g' or number(values.get('R')) is None:continue
        # Prefer measured eating-out and home-cooked foods, plus brand-labelled dishes.
        if values.get('E') not in ['1','3','4']:continue
        brand=values.get('EZ','');brand='' if brand in ['해당없음','-'] else brand
        name=values['B'].replace('_',' · ')+(f' ({brand})' if brand else '')
        nutrients={k:number(values.get(col)) for k,col in columns.items()}
        key=(name,values['R'],json.dumps(nutrients,sort_keys=True))
        if key in seen:continue
        seen.add(key)
        serving=re.fullmatch(r'([\d.]+)g',values.get('EY',''))
        grams=float(serving[1]) if serving and 0<float(serving[1])<=3000 else 100
        scale=lambda v:round(v*grams/100,3) if v is not None else None
        output.append({'id':values['A'],'name':name,'kcal':scale(number(values['R'])),'grams':grams,'nutrients':{k:scale(v) for k,v in nutrients.items()},'per100g':{'kcal':number(values['R']),'nutrients':nutrients},'source':'식약처 식품영양성분 DB · '+values.get('FB','참고값'),'sourceUrl':'https://various.foodsafetykorea.go.kr/nutrient/general/food/detail.do?searchFoodCd='+values['A']})
    output.sort(key=lambda r:('(' in r['name'],len(r['name']),r['name']))
    target=Path(__file__).resolve().parent.parent/'public'/'foods.json'
    target.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(f'Imported {len(output)} verified 100g-based food rows; {target.stat().st_size} bytes.')
