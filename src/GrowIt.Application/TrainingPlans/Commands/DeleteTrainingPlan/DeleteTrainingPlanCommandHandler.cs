using GrowIt.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GrowIt.Application.TrainingPlans.Commands.DeleteTrainingPlan;

public class DeleteTrainingPlanCommandHandler(IApplicationDbContext dbContext)
    : IRequestHandler<DeleteTrainingPlanCommand>
{
    public async Task Handle(DeleteTrainingPlanCommand request, CancellationToken cancellationToken)
    {
        var plan = await dbContext.TrainingPlans
            .Include(p => p.Days)
            .FirstOrDefaultAsync(p => p.Id == request.PlanId && p.UserId == request.UserId, cancellationToken);

        // Nothing to delete is the outcome the caller asked for, so say so. A queued
        // delete can easily outlive its target: create and delete something offline,
        // have the create fail for good, and the delete then arrives at an empty spot.
        if (plan is null) return;

        // Workouts are history and outlive the plan they came from - detach them
        // rather than letting the delete cascade take them down.
        var dayIds = plan.Days.Select(d => d.Id).ToList();
        var workouts = await dbContext.Workouts
            .Where(w => w.PlanDayId != null && dayIds.Contains(w.PlanDayId.Value))
            .ToListAsync(cancellationToken);

        foreach (var workout in workouts)
        {
            workout.PlanDayId = null;
        }

        // Losing the active plan would leave the today screen with nothing to suggest, so
        // the successor is chosen before anything is written. Two separate saves would
        // leave a user with no active plan at all if the second never happened - a state
        // nothing later corrects.
        if (plan.IsActive)
        {
            var fallback = await dbContext.TrainingPlans
                .Where(p => p.UserId == request.UserId && p.Id != plan.Id)
                .OrderBy(p => p.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);

            if (fallback is not null)
            {
                fallback.IsActive = true;
            }
        }

        dbContext.TrainingPlans.Remove(plan);
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
