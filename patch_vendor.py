f = '/Users/daniell/.gemini/antigravity/scratch/vendor-cost-portal/views-vendor.js'
with open(f, 'r') as fh:
    c = fh.read()

# 1. My Styles table -- FOB and Factory Cost cells: show flag dots
OLD_FOB_CELL = '                  <td class="font-bold">${sub?.fob ? \'$\' + parseFloat(sub.fob).toFixed(2) : \'—\'}</td>'
OLD_FC_CELL  = '                  <td class="text-sm">${sub?.factoryCost ? \'$\' + parseFloat(sub.factoryCost).toFixed(2) : \'—\'}</td>'

NEW_FOB_CELL = '''                  <td class="font-bold">${(() => {
                    const flag = sub ? DB.CellFlags.get(sub.id, 'fob') : null;
                    const revs = sub ? DB.Revisions.byField(sub.id, 'fob').length : 0;
                    const dot  = flag ? `<span class="flag-dot flag-${flag.color}" title="${(flag.note||'').replace(/"/g,'&quot;') || flag.color}"></span>` : '';
                    const hist = revs > 1 ? `<span class="revision-badge vendor-hist" title="View history (${revs})" onclick="App.openRevisionHistory('${sub?.id}','fob')">&#128338; ${revs}</span>` : '';
                    return `${sub?.fob ? '$' + parseFloat(sub.fob).toFixed(2) : '—'}${dot}${hist}`;
                  })()}</td>'''

NEW_FC_CELL  = '''                  <td class="text-sm">${(() => {
                    const flag = sub ? DB.CellFlags.get(sub.id, 'factoryCost') : null;
                    const revs = sub ? DB.Revisions.byField(sub.id, 'factoryCost').length : 0;
                    const dot  = flag ? `<span class="flag-dot flag-${flag.color}" title="${(flag.note||'').replace(/"/g,'&quot;') || flag.color}"></span>` : '';
                    const hist = revs > 1 ? `<span class="revision-badge vendor-hist" title="View history (${revs})" onclick="App.openRevisionHistory('${sub?.id}','factoryCost')">&#128338; ${revs}</span>` : '';
                    return `${sub?.factoryCost ? '$' + parseFloat(sub.factoryCost).toFixed(2) : '—'}${dot}${hist}`;
                  })()}</td>'''

if OLD_FOB_CELL not in c:
    print("ERROR: OLD_FOB_CELL not found"); exit(1)
if OLD_FC_CELL not in c:
    print("ERROR: OLD_FC_CELL not found"); exit(1)

c = c.replace(OLD_FOB_CELL, NEW_FOB_CELL, 1)
c = c.replace(OLD_FC_CELL,  NEW_FC_CELL,  1)
print("My Styles table OK")

# 2. Quote form: show admin flag notes above FOB and Factory Cost inputs
OLD_FOB_INPUT = '      <div class="form-row form-row-2">\n        <div class="form-group"><label class="form-label">FOB Cost (USD) *</label><input class="form-input" id="q-fob"'
NEW_FOB_INPUT = '''      ${(() => {
        const sub = DB.Submissions.byTcAndStyle(tcId, styleId).find(s => s.coo === coo) || null;
        const fFlag = sub ? DB.CellFlags.get(sub.id, 'fob') : null;
        const cFlag = sub ? DB.CellFlags.get(sub.id, 'factoryCost') : null;
        const banner = (flag, label) => flag ? `<div class="flag-banner flag-banner-${flag.color}"><strong>&#128681; ${label} Flagged</strong>${flag.note ? ': ' + flag.note : ''}</div>` : '';
        return banner(fFlag,'FOB') + banner(cFlag,'Factory Cost');
      })()}
      <div class="form-row form-row-2">
        <div class="form-group"><label class="form-label">FOB Cost (USD) *</label><input class="form-input" id="q-fob"'''

if OLD_FOB_INPUT not in c:
    print("ERROR: OLD_FOB_INPUT not found"); exit(1)
c = c.replace(OLD_FOB_INPUT, NEW_FOB_INPUT, 1)
print("Quote form banner OK")

with open(f, 'w') as fh:
    fh.write(c)
print('Done')
