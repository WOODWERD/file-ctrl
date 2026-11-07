# Changelog

What changed in each version of [File Ctrl](https://woodwerd.github.io/file-ctrl/), newest first. Versions are x-numbers while File Ctrl is a public beta.

## x0.0.15 · 2026-11-07
- Open any step of a label by choosing its number or title, in any order. To change only the icon, choose 5. No more pressing Next through every step. Opening Name check runs the check; opening Icon fills in the search.
- Closed steps now show what they hold, such as the name, the icon and the contents line count.

## x0.0.14 · 2026-11-06
- Ticking or unticking a label, or changing its status, no longer jumps the page back to the top. Focus stays on the control you used.

## x0.0.13 · 2026-11-06
- Five more BISLEY finishes in the colour menu: Anthracite Grey, Black, Doulton Blue, BISLEY Orange and Palest Pink. Like Golden Sunflower Yellow, their start colours come from BISLEY product photos and are marked not matched until you pick from a test strip.
- Anthracite Grey and Black print with white lettering. Doulton Blue, BISLEY Orange and Palest Pink print black.

## x0.0.12 · 2026-11-06
- Coloured labels no longer show a white rim on the Liene. File Ctrl draws them 1 mm bigger than the card, and the print steps set the Liene border to −1, so the cut lands inside the colour. White labels are unchanged.
- Coloured labels print on their own sheets, with Colour in the file name, and the steps and PRINT.txt give each its border. Coloured singles show their own size to type, such as W 27 × H 97.
- Test strips print the same way.

## x0.0.11 · 2026-11-06
- Icon Ctrl's Print set moves from x0.0.5 to x0.0.7: 151 icons, up from 135. New are helping hands, paper, a notebook, an envelope, sticky notes, a paper clip, a binder, a label roll, an ink bottle, a cardboard box, a filament spool, a battery cell, keys, a wallet, a card and toothpicks. Every icon your drawers already use is unchanged.

## x0.0.10 · 2026-11-06
- The first BISLEY finish in the colour menu: Golden Sunflower Yellow. Its start colour comes from a BISLEY product photo, so it's marked not matched until you pick from a test strip.

## x0.0.9 · 2026-11-06
- Colour on the label. Each set of drawers can be printed in a colour to match its cabinet. Choose it beside the set's name in the library, or give one drawer its own under Label colour.
- File Ctrl shows the labels in the new colour before anything changes. Applying it selects them for reprinting, and Undo puts it back.
- On dark colours the name, icon and number are left as bare white paper. On light ones they print black. White labels print exactly as before.
- Print a test strip of nine shades, coded A1 to C3, hold it against the drawer and pick the closest. The pick is saved as tuned.
- PDFs run a coloured label 1.5 mm past the crop marks, so a hand cut has no white edge.
- When the same drawer is changed on two devices, you can now keep this device's or GitHub's for every change at once.
- The guide has a new Colour on the label section.

## x0.0.8 · 2026-11-06
- Move a drawer to another slot. Drag its ID in the library, or open the drawer and choose Move to. The drawers in between shift one slot, or choose Swap instead to trade two.
- Before anything changes, File Ctrl lists every drawer number that will change. Each drawer with a new number goes back to Built and is selected, ready to reprint. Undo puts it all back.
- Each drawer now carries a hidden key, so GitHub sync follows a drawer when it moves. An edit made on another device lands on the right drawer.
- The guide has a new Moving a drawer section.

## x0.0.7 · 2026-11-06
- GitHub storage. Connect File Ctrl to a private GitHub repo of your own, under Drawers, and the registry syncs between your devices as one file, `file-ctrl.json`, with a commit for every change. It's optional; without it nothing changes.
- A Sync light in the header says Synced, Saving, Offline with how many changes are waiting, Read only, or Needs attention.
- Changes on two devices merge drawer by drawer. If both changed the same thing, File Ctrl shows both and you choose. A name or icon used twice never reaches GitHub.
- A token that can only read makes that device look-only: it shows and prints the registry but can't change it. Handy on a phone.
- The token stays in this browser, never in an export, the registry or the repo. File Ctrl warns if the repo is public, and only ever reads or writes its own file.
- The guide has a new Storing it on GitHub section, linking to [Set up GitHub](https://woodwerd.github.io/github.html).

## x0.0.6 · 2026-11-06
- Desktop 3-drawer labels are confirmed: the holder is the same as the 10-drawer, so drawers D1 to D3 use the MultiDrawer card with no note.
- File cabinet labels use the whole card. The file cabinet has no holder, just the handle area on the front, so text has about 2 mm more width and 4 mm more height to sit in, and the note about an unmeasured window is gone.

## x0.0.5 · 2026-11-06
- A second BISLEY card size: File cabinet, 95 × 25 mm, alongside the 47 × 25 MultiDrawer card.
- File cabinet labels keep the icon and divider in the same place as MultiDrawer labels, and give the extra width to the name and contents.
- Each drawer now has a card size. Drawers F1 to F3 start as File cabinet, and you can change any drawer's size while editing it.
- Sheets and PDF pages hold one size at a time: 9 MultiDrawer or 3 File cabinet labels per Liene sheet, and 18 File cabinet labels per Letter page or 20 per A4.
- The File cabinet window isn't measured yet. Its labels show a note until it is.

## x0.0.4 · 2026-11-04
- New icons: filled silhouettes from [Icon Ctrl](https://woodwerd.github.io/icon-ctrl/) replace the Tabler line icons, on screen and on every label, PNG and PDF. The picker searches Icon Ctrl's 135 icons.
- Each of the 16 starting drawers has an icon of its own, such as a multimeter for Test, a soldering iron for Solder, a wire spool for Wire and a screw for Fasteners. None is flagged weak now.
- Registries saved before this version still load. The 16 starting drawers move to their new icons by themselves. Any other old icon shows as missing, and that drawer won't print until you pick a new one.
- Your own icons now follow Icon Ctrl's style: filled in currentColor with the even-odd rule, no stroke, artwork within 1 to 23.
- The user guide has a new Icons section.

## x0.0.3 · 2026-11-01
- A printer notice at the top of the app and the guide: you need a Liene PixCut S1 to print and cut these labels. The Letter and A4 PDFs print on any printer.

## x0.0.2 · 2026-11-01
- Label v4: a 14 mm icon, an 11.5 pt name that can run to two lines, 5.5 pt contents, and a rule between name and contents.

## x0.0.1 · 2026-11-01
- First public beta. Drawer labels for the BISLEY standard, with name checks, unique icons, a live proof through the holder, a registry with CSV and JSON, and exports for the Liene PixCut S1 and for any printer.
