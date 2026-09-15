using GrowIt.Application.Common.Exceptions;
using GrowIt.Application.Common.Idempotency;
using GrowIt.Application.Common.Interfaces;
using GrowIt.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GrowIt.Application.Workouts.Commands.CreateWorkoutFromPlanDay;

public class CreateWorkoutFromPlanDayCommandHandler(IApplicationDbContext dbContext)
    : IRequestHandler<CreateWorkoutFromPlanDayCommand, Guid>
{
    public async Task<Guid> Handle(CreateWorkoutFromPlanDayCommand request, CancellationToken cancellationToken)
    {
        if (await IdempotencyGuard.AlreadyCreatedAsync(
                dbContext.Workouts
                    .Where(w => w.Id == request.Id)
                    // The plan day is the parent here, so an id already spent on a plain
                    // workout is caught rather than answered as a successful retry.
                    .Select(w => new ExistingRow(w.UserId, w.PlanDayId ?? Guid.Empty)),
                request.Id, request.UserId, request.PlanDayId, cancellationToken))
        {
            return request.Id;
        }

        var day = await dbContext.TrainingPlanDays
            .Include(d => d.Exercises)
            .FirstOrDefaultAsync(
                d => d.Id == request.PlanDayId && d.Plan.UserId == request.UserId,
                cancellationToken)
            ?? throw new NotFoundException($"Plan day {request.PlanDayId} not found");

        // The client names the ids of the copied rows so it can start logging sets into
        // them before this request is answered - the whole point of starting a session
        // in a basement gym. Anything it did not name gets one from us.
        var assignedIds = request.ExerciseIds.ToDictionary(
            assignment => assignment.PlanDayExerciseId,
            assignment => assignment.WorkoutExerciseId);

        // The targets are copied rather than referenced: editing the plan later must
        // not rewrite what a past session says it was meant to be.
        var workout = new Workout
        {
            Id = request.Id,
            UserId = request.UserId,
            Name = day.Name,
            PerformedAt = request.PerformedAt,
            CreatedAt = DateTime.UtcNow,
            PlanDayId = day.Id,
            WorkoutExercises = day.Exercises
                .OrderBy(e => e.OrderIndex)
                .Select(e => new WorkoutExercise
                {
                    Id = assignedIds.TryGetValue(e.Id, out var assigned) ? assigned : Guid.CreateVersion7(),
                    ExerciseId = e.ExerciseId,
                    CustomExerciseName = e.CustomExerciseName,
                    TargetSets = e.TargetSets,
                    TargetReps = e.TargetReps,
                    RestSeconds = e.RestSeconds,
                    OrderIndex = e.OrderIndex
                })
                .ToList()
        };

        dbContext.Workouts.Add(workout);
        await dbContext.SaveChangesAsync(cancellationToken);

        return workout.Id;
    }
}
