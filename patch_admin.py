f = '/Users/daniell/.gemini/antigravity/scratch/vendor-cost-portal/views-admin.js'
with open(f, 'r') as fh:
    c = fh.read()

# Step 1: Insert cellWrap helper + flag/revision lookups before "const dutyPct"
OLD_DUTY = "          const dutyPct = r ? pct(r.dutyRate) : '\u2014';"
if OLD_DUTY not in c:
    print("ERROR: OLD_DUTY not found"); exit(1)

NEW_HELPERS = """          // Per-cell flags and revision history
          const fobFlag = sub ? DB.CellFlags.get(sub.id, 'fob') : null;
          const fcFlag  = sub ? DB.CellFlags.get(sub.id, 'factoryCost') : null;
          const fobRevs = sub ? DB.Revisions.byField(sub.id, 'fob').length : 0;
          const fcRevs  = sub ? DB.Revisions.byField(sub.id, 'factoryCost').length : 0;
          const cellWrap = (inputHtml, flag, revCount, subId, field) => {
            const dot  = flag ? `<span class="flag-dot flag-${flag.color}" title="${(flag.note||flag.color).replace(/"/g,'&quot;')}" onclick="App.openFlagMenu(event,'${subId}','${field}')"></span>` : '';
            const hist = revCount > 0 ? `<span class="revision-badge" title="Quote history (${revCount})" onclick="App.openRevisionHistory('${subId}','${field}')">&#128338;${revCount > 1 ? ' '+revCount : ''}</span>` : '';
            return `<div class="flaggable-cell${flag?' has-flag':''}" oncontextmenu="App.openFlagMenu(event,'${subId}','${field}');return false;">${inputHtml}${dot}${hist}</div>`;
          };
          const dutyPct = r ? pct(r.dutyRate) : '\u2014';"""

c = c.replace(OLD_DUTY, NEW_HELPERS, 1)
print("Step 1 OK")

# Step 2: Replace the TD lines for FOB and FC to use cellWrap
OLD_FOB_TD = '          <td data-col="${k}_fob"      class="col-vendor-sub ${tcColorClass}">${fobInput}</td>'
NEW_FOB_TD = '          <td data-col="${k}_fob"      class="col-vendor-sub ${tcColorClass} cell-flaggable">${cellWrap(fobInput, fobFlag, fobRevs, sub?.id||"", "fob")}</td>'

OLD_FC_TD  = '          <td data-col="${k}_fc"       class="col-vendor-sub tc-detail-col ${tcColorClass}" data-tckey="${k}"${hideStyle}>${fcInput}</td>'
NEW_FC_TD  = '          <td data-col="${k}_fc"       class="col-vendor-sub tc-detail-col ${tcColorClass} cell-flaggable" data-tckey="${k}"${hideStyle}>${cellWrap(fcInput, fcFlag, fcRevs, sub?.id||"", "factoryCost")}</td>'

if OLD_FOB_TD not in c:
    print("ERROR: OLD_FOB_TD not found"); exit(1)
if OLD_FC_TD not in c:
    print("ERROR: OLD_FC_TD not found"); exit(1)

c = c.replace(OLD_FOB_TD, NEW_FOB_TD, 1)
c = c.replace(OLD_FC_TD,  NEW_FC_TD, 1)
print("Step 2 OK")

with open(f, 'w') as fh:
    fh.write(c)
print('Done')
