import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/v2/not-found');
}
