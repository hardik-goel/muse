import type { Metadata } from 'next';
import { Clause, LegalPage } from '@/components/ui/Prose';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What Muse stores, what it does not, and how to take it all back.',
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="August 2026">
      <Clause heading="The short version">
        <p>
          Muse stores what you drop in, so it can hand it back to you later. It does not sell it,
          does not train models on it, and does not carry a single third-party tracker.
        </p>
      </Clause>

      <Clause heading="What is stored">
        <p>
          Your account email and name. The items you capture — their text, links, tags, notes and
          any images you attach. Your settings, your streaks, and a small first-party event log
          recording which features are used, never their contents.
        </p>
        <p>
          Images are stored in a private bucket and served only to your own signed-in session. They
          are never public URLs.
        </p>
      </Clause>

      <Clause heading="Guest mode">
        <p>
          Guest mode reaches no server. Items you create there live in your browser tab and are
          gone when it closes, unless you make an account — in which case they are uploaded once,
          on purpose, so nothing you wrote is lost at the signup boundary.
        </p>
      </Clause>

      <Clause heading="Intelligence and Anthropic">
        <p>
          With Intelligence switched on, the text of the item being classified — plus the titles
          and summaries of items relevant to what you asked — is sent to Anthropic&rsquo;s API to
          generate a response. It is not used to train their models. With Intelligence off, no
          content leaves the database at all.
        </p>
        <p>You can turn Intelligence off at any time in Settings, and it stops immediately.</p>
      </Clause>

      <Clause heading="Who else sees it">
        <p>
          Our hosting provider and database provider, because they run the servers. Our payment
          provider sees your payment details; we never do. Nobody else.
        </p>
      </Clause>

      <Clause heading="Deletion">
        <p>
          Deleting an item moves it to a trash you can restore from for thirty days, after which it
          is removed permanently. Deleting your account removes every row, every image and the
          login itself. There is no soft delete behind it, and no copy support can recover.
        </p>
      </Clause>

      <Clause heading="Export">
        <p>
          Settings → Your data → Export gives you one JSON file with everything in it. That file
          imports back into any Muse account, which is the point.
        </p>
      </Clause>
    </LegalPage>
  );
}
