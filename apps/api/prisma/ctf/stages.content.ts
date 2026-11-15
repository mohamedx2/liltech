/**
 * Participant-facing content for the LOUAGE 404 Mini-CTF.
 *
 * This file intentionally contains NO answers, hashes, passwords or ZIP
 * contents — only what a participant is allowed to read. Answers are supplied
 * separately through the organizer provisioning input
 * (`apps/api/prisma/provision-ctf.ts`) and land in the database as keyed
 * digests.
 */

export interface StageContent {
  slug: string;
  position: number;
  title: string;
  description: string;
  status: 'draft' | 'live' | 'closed';
  requiredForUnlock: boolean;
  hints: readonly string[];
}

export const LOUAGE_404_STAGES: readonly StageContent[] = [
  {
    slug: 'louage-404-01',
    position: 1,
    title: 'The Louage',
    description:
      'A photograph of a louage, and an archive nobody can open. Identify the vehicle — its manufacturer, its generation and its transport type — then use that identity to unlock the archive and recover the registration inside.',
    status: 'live',
    requiredForUnlock: true,
    hints: [
      'Look at the badge and the body shape. The archive password is built from three words joined without spaces: manufacturer, generation, transport type.',
      'The generation is written on the side of this shape of vehicle — a T-series number. Capitalize the manufacturer and the transport type.',
      'Volkswagen, T4 and the type of transport it runs as. Open the archive, then submit the registration written inside it.',
    ],
  },
  {
    slug: 'louage-404-02',
    position: 2,
    title: 'The Location',
    description:
      'The louage left from somewhere specific. Investigate the building, the road geometry, the architecture and any signs or flags in the photograph, and name the exact place.',
    status: 'live',
    requiredForUnlock: true,
    hints: [
      'Read every sign and poster in the frame before reaching for a search engine. One word will point you at the right city.',
      'This is a bus station in Tunis. Capitalize on that: which station in the capital carries this street layout?',
      'The station is named after a Bey of Tunis. Find the name on the station facade and submit it.',
    ],
  },
  {
    slug: 'louage-404-03',
    position: 3,
    title: 'The Departure',
    description:
      'Mokdad and Slah were talking while the louage filled up. Read their conversation, count who was already aboard, look at what the passengers were doing and at the wristwatch in the photograph — then work out the real departure time.',
    status: 'live',
    requiredForUnlock: true,
    hints: [
      'Start with the conversation: it tells you how many seats were already taken and how many people were still expected.',
      'The messages carry timestamps. Compare them with what the clock in the photograph shows, not with your own clock.',
      'The louage left a quarter of an hour past six. Submit the time as four digits, 24-hour format.',
    ],
  },
  {
    slug: 'louage-404-04',
    position: 4,
    title: 'The Invisible Message',
    description:
      'One of the files looks like plain text, but it is longer than it appears. Something is hiding inside it, character by character.',
    status: 'live',
    requiredForUnlock: true,
    hints: [
      'Open the text file and compare what you read with how many characters it actually contains.',
      'Some Unicode characters are invisible by design: zero-width spaces and joiners. They are still characters.',
      'Run the file through a zero-width / invisible-character decoder. The payload decodes to a clue about the driver.',
    ],
  },
  {
    slug: 'louage-404-05',
    position: 5,
    title: 'Find Si Mokdad',
    description:
      'The clue points at social media. Use everything you already know — the driver, the louage, the location — to identify the correct profile, and submit the exact name displayed on it.',
    // No confirmed answer yet: kept in draft so nobody can progress past it or
    // mistype a guess into a live stage.
    status: 'draft',
    requiredForUnlock: true,
    hints: [
      'Combine the identity clue from the previous stage with what you know about the driver and where he works.',
      'Search Facebook and search engines for the name and the louage context together. Many profiles will match the name alone.',
      'Verify the profile against the investigation: the photographs and the posts should agree with everything you have already seen. Submit the name exactly as displayed.',
    ],
  },
  {
    slug: 'louage-404-06',
    position: 6,
    title: 'The Proverb',
    description:
      'Mokdad posts a lot. Somewhere in his public posts a Tunisian proverb is left unfinished or encoded. Recover it exactly as he meant it.',
    status: 'live',
    requiredForUnlock: true,
    hints: [
      'Read the public posts on the correct profile, not only the photographs.',
      'Look at captions and comments for a proverb that stops in the middle.',
      'Recover the full expression in Arabic. Submit it as written, not in Arabizi.',
    ],
  },
  {
    slug: 'louage-404-07',
    position: 7,
    title: 'The Final Passenger',
    description:
      'An audio file, a handful of tones, and an archived story. Decode the recording, follow the number it gives you, and find the message the investigation has been building towards.',
    status: 'live',
    requiredForUnlock: true,
    hints: [
      'Listen to the recording and write down each tone as short or long. That is Morse code.',
      'The decoded sequence is an eight-digit phone number. It belongs to the driver.',
      'Follow the account to its story archive. The final message is archived, not on the profile grid.',
    ],
  },
];
