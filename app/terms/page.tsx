import type { Metadata } from 'next';
import { Clause, LegalPage } from '@/components/ui/Prose';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The agreement behind using Muse.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="August 2026">
      <Clause heading="The agreement">
        <p>
          Using Muse means agreeing to what is written here. If you disagree with any of it, the
          honest answer is not to use the product — and to export your data on the way out.
        </p>
      </Clause>

      <Clause heading="Your account">
        <p>
          One person per account. Keep your password to yourself; anything done through your
          session is treated as done by you. Tell us if that stops being true.
        </p>
      </Clause>

      <Clause heading="Your content">
        <p>
          What you drop into Muse stays yours. You give us only the permission required to store
          it, show it back to you, and — if you switch Intelligence on — send the relevant part of
          it to our AI provider so it can answer you.
        </p>
        <p>
          Do not store anything unlawful, and do not use Muse to distribute it. That is the whole
          content policy.
        </p>
      </Clause>

      <Clause heading="Plans and payment">
        <p>
          Local mode is free and not time-limited. Intelligence is billed monthly in INR through
          our payment provider. Cancelling stops the next charge; it does not refund the current
          period, and it does not delete a single item.
        </p>
        <p>
          A lapsed or cancelled subscription returns the product to Local mode. Everything you
          captured remains readable, editable and exportable.
        </p>
      </Clause>

      <Clause heading="Availability">
        <p>
          We try to keep Muse up and we will not always succeed. It is provided as-is, without a
          warranty of uninterrupted service. Capture works offline for exactly this reason.
        </p>
      </Clause>

      <Clause heading="Ending it">
        <p>
          You can delete your account at any time from Settings, and it is immediate and
          permanent. We may close an account that is used to break the law or to attack the
          service, and we will say why when we do.
        </p>
      </Clause>

      <Clause heading="Changes">
        <p>
          If these terms change in a way that matters, the change will be announced in the product
          before it takes effect rather than quietly backdated here.
        </p>
      </Clause>
    </LegalPage>
  );
}
