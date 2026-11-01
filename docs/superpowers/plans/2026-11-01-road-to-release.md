# Road to release

Date: 2026-11-01. Owner decision: every remaining feature ships before release, and nothing is pushed until the
list below reaches step 9. What each item is and where it comes from is in the master roadmap (§6–§10b); this file is
only the order. Testing follows the usual rule: unit tests and typecheck while building, one smoke run per step.

| Step | Work | Roadmap | Why here |
|---|---|---|---|
| 1 | Done, except confirming the black picture (91): theater mode (92) | §6 | Fixes come before features. 91 may be the same cause as 93, fixed 2026-11-01 |
| 2 | Done (s33, s35; karaoke by screenshot only): one scenario for lyrics and karaoke | §1.3 | Lyrics are a main feature, and the smoke set doesn't open them yet |
| 3 | Done (s35): lyrics romanization and translation lines (Japanese, Korean, Chinese) | F2, G8 | The owner's own listening |
| 4 | Done (s36): light mode | E1 | Theme tokens exist; YouTube Music's own light styles need mapping |
| 5 | Library: local playlists and import, smart shuffle | G7, G4 | Daily use |
| 6 | Bigger extras: offline downloads, Listen Together, animated artwork, song recognition | G2, G1, G9, G6 | Largest and riskiest, each behind its own switch. G6 only if a ≥ 1.5k★ open solution exists; otherwise it's dropped and recorded |
| 7 | Ready for other people: installer and updates, no keys, welcome, guide and demo | H2–H5 | The app must be feature-complete before the demo is recorded |
| 8 | Security audit, then a full test run and a clean `VERIFICATION.md` | H6 | Audit what will actually ship |
| 9 | Push and publish | H7 | Last |

## Decisions to take when the step starts
- **Step 6, downloads:** saving YouTube audio can break YouTube's terms. Off by default and for personal use, as
  planned; the owner should decide if it's in the public release, because it's the feature most likely to draw a takedown.
- **Step 6, Listen Together:** PeerJS's free public server is shared and comes with no guarantees. Decide between
  relying on it and hosting one.
- **Step 7, code signing:** see roadmap §10b.
