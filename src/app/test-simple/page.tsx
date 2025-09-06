export default function TestSimplePage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Test Page</h1>
      <p>This is a simple test page to verify routing works.</p>
      <p>Timestamp: {new Date().toISOString()}</p>
    </div>
  );
}