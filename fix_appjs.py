f = '/Users/daniell/.gemini/antigravity/scratch/vendor-cost-portal/app.js'
with open(f, 'r') as fh:
    c = fh.read()

# The bad section: flag functions are inside return {
# We need to:
# 1. Remove the flag function block from inside return {}
# 2. Remove the trailing blank line that appeared inside return
# 3. Re-insert the functions right before "return {"

FLAG_START_MARKER = '\n\n  // \u2500\u2500 Cell Flag Menu (right-click context menu) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'
FLAG_END_MARKER   = '\n    openFlagMenu, openFlagNoteModal, saveCellFlag, clearCellFlag,\n    openRevisionHistory,'

if FLAG_START_MARKER not in c:
    print("ERROR: FLAG_START_MARKER not found"); exit(1)
if FLAG_END_MARKER not in c:
    print("ERROR: FLAG_END_MARKER not found"); exit(1)

# Find where the flag section starts and ends
start_idx = c.index(FLAG_START_MARKER)
# Find end of the section — after FLAG_END_MARKER
export_idx = c.index(FLAG_END_MARKER) + len(FLAG_END_MARKER)

# Extract the flag function section (everything from FLAG_START_MARKER to FLAG_END_MARKER)
flag_section = c[start_idx:c.index(FLAG_END_MARKER)]

# The section is currently inside return {} -- remove it from there and also clean up the dangling ',\n'
# Before start_idx there should be '    openUploadModal, ...download...,\n'
# After the flag section, in the return {}, the exports are still there
# Let's just extract the functions and remove them from their current (wrong) location

# Remove flag section from inside return
c_cleaned = c[:start_idx] + c[c.index(FLAG_END_MARKER):]

# Now find the proper insertion point: RIGHT BEFORE "  return {"
RETURN_MARKER = '\n  return {\n    init,'
if RETURN_MARKER not in c_cleaned:
    print("ERROR: RETURN_MARKER not found"); exit(1)

ret_pos = c_cleaned.index(RETURN_MARKER)
c_fixed = c_cleaned[:ret_pos] + flag_section + '\n' + c_cleaned[ret_pos:]

with open(f, 'w') as fh:
    fh.write(c_fixed)

print('Done. Verify:')
# Quick check
if '  return {\n    init,' in c_fixed:
    func_end = c_fixed.rfind('function clearCellFlag')
    ret_start = c_fixed.index('  return {\n    init,')
    if func_end < ret_start:
        print('OK: flag functions are BEFORE return {}')
    else:
        print('ERROR: flag functions still after return {}')
