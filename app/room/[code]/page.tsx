import VersusGame from '@/components/VersusGame';

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <main className="app">
      <VersusGame code={code} />
    </main>
  );
}
