using GrowIt.Application.Common.Exceptions;
using GrowIt.Application.Common.Idempotency;
using GrowIt.Application.Common.Interfaces;
using GrowIt.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GrowIt.Application.Workouts.Commands.LogSet;

public class LogSetCommandHandler(IApplicationDbContext dbContext) : IRequestHandler<LogSetCommand, Guid>
{
    public async Task<Guid> Handle(LogSetCommand request, CancellationToken cancellationToken)
    {
        // Sets are the one thing that gets logged mid-workout with no signal, so this
        // is the retry path that matters most: the same set must never land twice.
        if (await IdempotencyGuard.AlreadyCreatedAsync(
                dbContext.Sets
                    .Where(s => s.Id == request.Id)
                    .Select(s => new ExistingRow(s.WorkoutExercise.Workout.UserId, s.WorkoutExerciseId)),
                request.Id, request.UserId, request.WorkoutExerciseId, cancellationToken))
        {
            return request.Id;
        }

        // As with AddExerciseToWorkout, this check did not exist at all.
        var exerciseIsMine = await dbContext.WorkoutExercises
            .AnyAsync(
                e => e.Id == request.WorkoutExerciseId && e.Workout.UserId == request.UserId,
                cancellationToken);

        if (!exerciseIsMine)
        {
            throw new NotFoundException($"Workout exercise {request.WorkoutExerciseId} not found");
        }

        var set = new Set
        {
            Id = request.Id,
            WorkoutExerciseId = request.WorkoutExerciseId,
            Reps = request.Reps,
            WeightKg = request.WeightKg,
            // Was hardcoded to 0, which left every set in a workout claiming to be first.
            OrderIndex = request.OrderIndex
        };

        dbContext.Sets.Add(set);
        await dbContext.SaveChangesAsync(cancellationToken);

        return set.Id;
    }
}
