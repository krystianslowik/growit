using GrowIt.Application.Common.Exceptions;
using GrowIt.Application.Common.Interfaces;
using GrowIt.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GrowIt.Application.TrainingPlans.Commands.SetPlanDayExercises;

public class SetPlanDayExercisesCommandHandler(IApplicationDbContext dbContext)
    : IRequestHandler<SetPlanDayExercisesCommand>
{
    // What a freshly picked exercise starts on; the user tunes it afterwards on the day
    // view. Mirrored by DEFAULT_TARGETS in the mobile app.
    private const int DefaultTargetSets = 3;
    private const int DefaultTargetReps = 10;
    private const int DefaultRestSeconds = 90;

    public async Task Handle(SetPlanDayExercisesCommand request, CancellationToken cancellationToken)
    {
        var day = await dbContext.TrainingPlanDays
            .Include(d => d.Exercises)
            .FirstOrDefaultAsync(
                d => d.Id == request.PlanDayId && d.Plan.UserId == request.UserId,
                cancellationToken);

        if (day is null)
        {
            throw new NotFoundException($"Plan day {request.PlanDayId} not found");
        }

        // Snapshot before touching anything: EF's relationship fix-up pushes rows we add
        // into day.Exercises, and they must not be mistaken for pre-existing ones - neither
        // as reuse candidates nor as rows to drop.
        var originalRows = day.Exercises.ToList();
        var byRowId = originalRows.ToDictionary(e => e.Id);
        var claimed = new HashSet<Guid>();
        var resolved = new TrainingPlanDayExercise?[request.Selections.Count];

        // Ids the client minted for rows it is adding. Kept apart from the reuse pass so
        // an explicitly named row can never be quietly answered with a different one.
        var idsToCreateWith = new Guid?[request.Selections.Count];

        // Rows the caller named outright are claimed first, so the reuse pass below cannot
        // steal one out from under them.
        for (var index = 0; index < request.Selections.Count; index++)
        {
            var selection = request.Selections[index];
            if (selection.PlanDayExerciseId is not { } rowId) continue;

            if (byRowId.TryGetValue(rowId, out var row))
            {
                claimed.Add(rowId);
                resolved[index] = row;
                continue;
            }

            // Not one of this day's rows. Either the client generated the id for a row it
            // is adding - which is how a day edited offline arrives - or the id belongs to
            // something that already exists, and taking that over is not ours to do.
            var takenElsewhere = await dbContext.TrainingPlanDayExercises
                .AnyAsync(e => e.Id == rowId, cancellationToken);

            if (takenElsewhere)
            {
                throw new ConflictException($"Plan day exercise {rowId} belongs to another day.");
            }

            if (selection.ExerciseId is null && string.IsNullOrWhiteSpace(selection.CustomExerciseName))
            {
                throw new NotFoundException($"Plan day exercise {rowId} not found");
            }

            idsToCreateWith[index] = rowId;
        }

        // An entry naming only an exercise reuses a row the day already has for it, rather
        // than dropping that row and inserting a twin. That keeps ids - and the targets
        // hanging off them - stable when the same desired list is sent twice.
        for (var index = 0; index < request.Selections.Count; index++)
        {
            if (resolved[index] is not null) continue;

            var selection = request.Selections[index];

            // Reuse is tried even when the caller named an id of its own, and that is
            // deliberate. A second device working from a stale copy of the day will mint a
            // fresh id for an exercise the day already holds; honouring that id would drop
            // the existing row and rebuild it on the defaults, losing whatever the user had
            // tuned. Keeping the row is worth more than keeping the id - and the caller
            // reconciles on the next read, which resolves by exercise rather than by id.
            var reusable = originalRows.FirstOrDefault(e =>
                !claimed.Contains(e.Id)
                && (selection.ExerciseId.HasValue
                    ? e.ExerciseId == selection.ExerciseId
                    : e.ExerciseId is null && e.CustomExerciseName == selection.CustomExerciseName));

            if (reusable is not null)
            {
                claimed.Add(reusable.Id);
                resolved[index] = reusable;
                continue;
            }

            var created = new TrainingPlanDayExercise
            {
                Id = idsToCreateWith[index] ?? Guid.CreateVersion7(),
                PlanDayId = day.Id,
                ExerciseId = selection.ExerciseId,
                CustomExerciseName = selection.CustomExerciseName,
                TargetSets = DefaultTargetSets,
                TargetReps = DefaultTargetReps,
                RestSeconds = DefaultRestSeconds
            };

            dbContext.TrainingPlanDayExercises.Add(created);
            resolved[index] = created;
        }

        foreach (var dropped in originalRows.Where(e => !claimed.Contains(e.Id)))
        {
            dbContext.TrainingPlanDayExercises.Remove(dropped);
        }

        for (var index = 0; index < resolved.Length; index++)
        {
            resolved[index]!.OrderIndex = index;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
