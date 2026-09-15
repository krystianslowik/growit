using GrowIt.Application.Common.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace GrowIt.Application.Common.Idempotency;

/// What a client-supplied id turned out to point at: who owns the row, and what it hangs
/// off. Root entities have no parent worth speaking of, so they report their owner twice.
public sealed record ExistingRow(Guid OwnerId, Guid ParentId);

/// Decides what a create should do when the client picked the id.
///
/// Ids come from the client so a write can be composed offline, retried, and still land
/// exactly once. That makes the checks below load-bearing rather than defensive: with a
/// server-generated Guid a caller could not name a row that did not exist yet, and now
/// it can.
public static class IdempotencyGuard
{
    /// Four outcomes for a client-supplied id:
    ///   nobody holds it        -> false, go ahead and insert
    ///   we hold it, same place -> true, the write already landed and this is a retry;
    ///                             answer success and change nothing
    ///   someone else holds it  -> throw, because quietly taking it over is the one thing
    ///                             that must never happen
    ///   we hold it elsewhere   -> throw, because answering success would leave the caller
    ///                             believing a write landed that was never made
    ///
    /// The caller projects both, so each entity states its own path to a user and to its
    /// parent - a plan owns itself, a set reaches back through its exercise and workout.
    public static async Task<bool> AlreadyCreatedAsync(
        IQueryable<ExistingRow> rows,
        Guid id,
        Guid userId,
        Guid expectedParentId,
        CancellationToken cancellationToken)
    {
        var found = await rows.Take(1).ToListAsync(cancellationToken);
        if (found.Count == 0) return false;

        var existing = found[0];

        if (existing.OwnerId != userId)
        {
            throw new ConflictException($"Id {id} is already in use.");
        }

        // Same id, different parent. Treating this as a successful retry would return 200
        // for a row that was never written where the caller thinks it was - the set shows
        // up under the exercise on screen and is missing after the next refetch.
        if (existing.ParentId != expectedParentId)
        {
            throw new ConflictException($"Id {id} already belongs to something else.");
        }

        return true;
    }
}
