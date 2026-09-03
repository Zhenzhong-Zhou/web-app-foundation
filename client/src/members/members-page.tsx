import {
  Alert,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/use-auth';
import { ApiError, api } from '../lib/api';
import { useDelayedFlag } from '../lib/use-delayed-flag';

interface Member {
  id: string;
  email: string;
  name: string;
  roleId: string;
}

interface Role {
  id: string;
  name: string;
}

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

export function MembersPage() {
  const { session } = useAuth();

  const [members, setMembers] = useState<Member[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const loading = members === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  // Both in one round trip. The members list carries roleId rather than a
  // name — the id is what PATCH takes and what survives a rename — and the
  // roles list is needed for the dropdown regardless.
  const load = useCallback(async () => {
    const [nextMembers, nextRoles] = await Promise.all([
      api<Member[]>('/users'),
      api<Role[]>('/roles'),
    ]);

    setMembers(nextMembers);
    setRoles(nextRoles);
    setError(null);
  }, []);

  useEffect(() => {
    let ignore = false;

    void Promise.all([api<Member[]>('/users'), api<Role[]>('/roles')])
      .then(([nextMembers, nextRoles]) => {
        if (ignore) return;
        setMembers(nextMembers);
        setRoles(nextRoles);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, []);

  async function changeRole(memberId: string, roleId: string) {
    setSaving(memberId);
    setError(null);

    try {
      await api(`/users/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ roleId }),
      });

      // Re-read rather than patching the row locally: the server is the only
      // thing that knows whether the change was allowed and what the row now
      // holds.
      await load();
    } catch (caught) {
      // The server's message, not a guess. A 403 means the caller may not
      // grant that role; a 409 means this is the last Owner. The client
      // cannot reliably tell which applies before asking, which is why the
      // options are not hidden.
      setError(messageFor(caught));
    } finally {
      setSaving(null);
    }
  }

  const roleName = (roleId: string) =>
    roles.find((role) => role.id === roleId)?.name ?? 'Unknown';

  return (
    // Heading draws immediately; only the table holds space and fills in.
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        Members
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        {loading ? (
          <Stack sx={{ p: 2 }} spacing={1}>
            {showSkeleton ? (
              <>
                <Skeleton height={48} />
                <Skeleton height={48} />
              </>
            ) : null}
          </Stack>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {members?.map((member) => {
                const isSelf = member.id === session?.user.id;

                return (
                  <TableRow key={member.id}>
                    <TableCell>{member.name}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      {/* Rendered as plain text when the caller lacks
                          users.update. That is display only — the 403 from
                          the server is the actual control (ADR-016). */}
                      {session?.permissions.includes('users.update') ? (
                        <Select
                          size="small"
                          value={member.roleId}
                          disabled={saving !== null}
                          onChange={(event) =>
                            void changeRole(member.id, event.target.value)
                          }
                        >
                          {roles.map((role) => (
                            <MenuItem key={role.id} value={role.id}>
                              {role.name}
                            </MenuItem>
                          ))}
                        </Select>
                      ) : (
                        roleName(member.roleId)
                      )}

                      {/* Not disabled: an Owner may legitimately demote
                          themselves once a second Owner exists, and the
                          server answers 409 when they cannot. */}
                      {isSelf && (
                        <Typography
                          variant="caption"
                          sx={{ ml: 1 }}
                          color="text.secondary"
                        >
                          you
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
