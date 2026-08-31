import { useAuth } from './auth/use-auth';

export default function App() {
  const { session, loading, error } = useAuth();

  if (loading) return <p>Loading…</p>;
  if (error) return <p>Could not reach the server: {error.message}</p>;
  if (!session) return <p>Not signed in.</p>;

  return (
    <div>
      <p>
        Signed in as {session.user.name} ({session.user.email})
      </p>
      <p>Organization: {session.organization?.name ?? 'none'}</p>
      <p>Permissions: {session.permissions.length}</p>
    </div>
  );
}
