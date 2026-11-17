# Relix audio credits and licenses

All sound effects are synthesized at runtime with Web Audio in `js/audio.js` (oscillators, filtered noise,
FM, Karplus-Strong strings and generated reverb impulses). They use no sample files, so no third-party
license applies to them.

Music ids without a file (`floor2`, `floor3`, `floor5`) are generated procedurally by the `ProcTrack`
engine in `js/audio.js`, using the themes `sand`, `forge` and `sanctum`. This is original code with no
third-party material. Every file-backed id also has a procedural fallback theme, used if the file fails to load.

The files in `music/` are licensed **CC0 1.0 / public domain**. No attribution is required, but it is given
here. Each was downloaded from GitHub (the network allows only GitHub and npm). Each was then trimmed to a
musically matched loop with a 1.2 s crossfaded seam and 0.35 s of pre/post-roll, loudness-normalized, and
re-encoded to MP3 (44.1 kHz stereo, 112 kbps; stingers 128 kbps). Loop points are listed in `TRACKS` in `js/audio.js`.

| id | file | title | author | license | source |
|---|---|---|---|---|---|
| title | music/title.mp3 | The Britons | Kevin MacLeod | CC0 1.0 (FreePD) | https://github.com/SoundSafari/CC0-1.0-Music/blob/655388f987eacf6d08d73080fcc3e727f267bfde/freepd.com/The%20Britons.mp3 |
| menu | music/menu.mp3 | Brewing Potions | Rafael Krux | CC0 1.0 (FreePD) | https://github.com/SoundSafari/CC0-1.0-Music/blob/655388f987eacf6d08d73080fcc3e727f267bfde/freepd.com/Brewing%20Potions.mp3 |
| floor1 (Bone Crypt) | music/floor1.mp3 | Witch Waltz | Kevin MacLeod | CC0 1.0 (FreePD) | https://github.com/SoundSafari/CC0-1.0-Music/blob/655388f987eacf6d08d73080fcc3e727f267bfde/freepd.com/Witch%20Waltz.mp3 |
| floor4 (Gloom Mire) | music/floor4.mp3 | Forest Night | Phase Shift | CC0 1.0 (FreePD) | https://github.com/SoundSafari/CC0-1.0-Music/blob/655388f987eacf6d08d73080fcc3e727f267bfde/freepd.com/Forest%20Night.mp3 |
| boss | music/boss.mp3 | One Step Closer | Rafael Krux | CC0 1.0 (FreePD) | https://github.com/SoundSafari/CC0-1.0-Music/blob/655388f987eacf6d08d73080fcc3e727f267bfde/freepd.com/One%20Step%20Closer.mp3 |
| victory | music/victory.mp3 | victory (SNES set) | Beatscribe | CC0 1.0 | https://github.com/Beatscribe/homebrew_vgm/blob/5a82f88b87bb442499685c494b7a96278121b4c7/SNES/mp3/victory.mp3 |
| defeat | music/defeat.mp3 | game_over (SNES set) | Beatscribe | CC0 1.0 | https://github.com/Beatscribe/homebrew_vgm/blob/5a82f88b87bb442499685c494b7a96278121b4c7/SNES/mp3/game_over.mp3 |

Source loop windows (seconds in the original file): title 6.827–102.846, menu 30.650–85.850, floor1 39.102–159.102,
floor4 11.192–96.186, boss 3.111–60.716. The victory/defeat stingers had silence trimmed and were then
loudness-normalized to -16 LUFS.

## License verification

- **FreePD tracks** (Kevin MacLeod, Rafael Krux, Phase Shift). The original publisher is FreePD.com. On
  2026-11-16 its category page https://freepd.com/misc.php still read: *"100% Free Music - Creative Commons 0
  No Attribution - Copyright Free"*, *"Free for Commercial Use, Free Of Royalties, Free Of Attribution,
  Creative Commons 0"*. That page lists, under **Fantasy**: "Witch Waltz: Kevin MacLeod", "The Britons:
  Kevin MacLeod", "Forest Night: Phase Shift", "One Step Closer: Rafael Krux" and "Brewing Potions:
  Rafael Krux". The files were fetched from the GitHub mirror SoundSafari/CC0-1.0-Music (repo license
  CC0-1.0, folder `freepd.com/`). Their embedded ID3 tags match: artist "Kevin MacLeod" with comment
  "source: freepd.com", "Rafael Krux" with genre "Fantasy", and "Phase Shift". FreePD.com has since closed
  (its homepage says the site "is now permanently closed"). The CC0 dedication made when these tracks were
  published stays valid.
- **Beatscribe stingers.** The repository README at
  https://github.com/Beatscribe/homebrew_vgm (commit 5a82f88) states: *"They are available under Creative
  Commons Zero for your use in any project you'd like … All this is availabe under the CC0 license."*
  GitHub reports the repo license as CC0-1.0. The author asks, optionally, to be credited as "Beatscribe".

Candidates rejected for unclear provenance: "Abstract Anxiety" (ID3 artist doesn't match FreePD's listing),
anything from the mirror's `pixbay.com/` and `chosic.com/` folders (not CC0 at the source), and any FreePD
title not listed on a FreePD page that could be reached.

SHA-256 prefixes of the original downloads: The Britons 00e766ef7a2635b1, Brewing Potions 1b380a8c0fc4dfda,
Witch Waltz 44fc88c7b3c1d06f, Forest Night f087318d48e22ca2, One Step Closer c8af8ad8c314a0e3,
victory c368603b4e82aabd, game_over a43eaa355bc3e5df.
