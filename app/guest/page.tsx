import { redirect } from 'next/navigation';

export default function GuestIndexPage() {
  redirect('/guest/now');
}
