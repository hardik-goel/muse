import { ItemDetail } from '@/components/items/ItemDetail';

export default async function GuestItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ItemDetail id={id} />;
}
