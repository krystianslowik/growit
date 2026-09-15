using GrowIt.Application.Common.Exceptions;
using GrowIt.Application.Common.Idempotency;
using GrowIt.Application.Common.Interfaces;
using GrowIt.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GrowIt.Application.TrainingPlans.Commands.AddExerciseToPlanDay;

public class AddExerciseToPlanDayCommandHandler(IApplicationDbContext dbContext)
    : IRequestHandler<AddExerciseToPlanDayCommand, Guid>
{
    public async Task<Guid> Handle(AddExerciseToPlanDayCommand request, CancellationToken cancellationToken)
    {
        if (await IdempotencyGuard.AlreadyCreatedAsync(
                dbContext.TrainingPlanDayExercises
                    .Where(e => e.Id == request.Id)
                    .Select(e => new ExistingRow(e.PlanDay.Plan.UserId, e.PlanDayId)),
                request.Id, request.UserId, request.PlanDayId, cancellationToken))
        {
            return request.Id;
        }

        var dayExists = await dbContext.TrainingPlanDays
            .AnyAsync(d => d.Id == request.PlanDayId && d.Plan.UserId == request.UserId, cancellationToken);

        if (!dayExists)
        {
            throw new NotFoundException($"Plan day {request.PlanDayId} not found");
        }

        var lastOrderIndex = await dbContext.TrainingPlanDayExercises
            .Where(e => e.PlanDayId == request.PlanDayId)
            .MaxAsync(e => (int?)e.OrderIndex, cancellationToken) ?? -1;

        var exercise = new TrainingPlanDayExercise
        {
            Id = request.Id,
            PlanDayId = request.PlanDayId,
            ExerciseId = request.ExerciseId,
            CustomExerciseName = request.CustomExerciseName,
            TargetSets = request.TargetSets,
            TargetReps = request.TargetReps,
            RestSeconds = request.RestSeconds,
            OrderIndex = lastOrderIndex + 1
        };

        dbContext.TrainingPlanDayExercises.Add(exercise);
        await dbContext.SaveChangesAsync(cancellationToken);

        return exercise.Id;
    }
}
