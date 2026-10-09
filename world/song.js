// The timing of the Levites' song, shared by the music (soundscape.js) and the routines that sound a blast at each of
// its pauses (Mishnah Tamid 7:3). The tune and the tempo are imagination; the pauses between sections are the source's.
export const BEAT = 700; // ms
export const SECTION = 34; // beats of singing in a full section
export const REST = 10; // beats of silence between sections
export const CYCLE_S = ((SECTION + REST) * BEAT) / 1000; // seconds from one section's start to the next
export const SECTION_S = (SECTION * BEAT) / 1000; // seconds a full section sings
