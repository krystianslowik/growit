using GrowIt.Application.Common.Exceptions;
using GrowIt.Application.Common.Idempotency;
using GrowIt.Application.Common.Interfaces;
using GrowIt.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GrowIt.Application.Workouts.Commands.AddExerciseToWorkout;

public class AddExerciseToWorkoutHandler(IApplicationDbContext dbContext)
    : IRequestHandler<AddExerciseToWorkoutCommand, Guid>
{
    public async Task<Guid> Handle(AddExerciseToWorkoutCommand request, CancellationToken cancellationToken)
    {
        if (await IdempotencyGuard.AlreadyCreatedAsync(
                dbContext.WorkoutExercises
                    .Where(e => e.Id == request.Id)
                    .Select(e => new ExistingRow(e.Workout.UserId, e.WorkoutId)),
                request.Id, request.UserId, request.WorkoutId, cancellationToken))
        {
            return request.Id;
        }

        // This check did not exist: the workout id came off the route and was written to
        // on trust, so anyone holding a valid token could append to anyone's session.
        var workoutIsMine = await dbContext.Workouts
            .AnyAsync(w => w.Id == request.WorkoutId && w.UserId == request.UserId, cancellationToken);

        if (!workoutIsMine)
        {
            throw new NotFoundException($"Workout {request.WorkoutId} not found");
        }

        var workoutExercise = new WorkoutExercise
        {
            Id = request.Id,
            WorkoutId = request.WorkoutId,
            ExerciseId = request.ExerciseId,
            // Position is the client's call: several rows may have been added offline,
            // and only it knows what order the user put them in.
            OrderIndex = request.OrderIndex,
            TargetSets = request.TargetSets,
            TargetReps = request.TargetReps,
            RestSeconds = request.RestSeconds
        };

        dbContext.WorkoutExercises.Add(workoutExercise);
        await dbContext.SaveChangesAsync(cancellationToken);

        return workoutExercise.Id;
    }
}
