using GrowIt.Application.Common.Interfaces;
using GrowIt.Contracts.TrainingPlans.Responses;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GrowIt.Application.TrainingPlans.Queries.GetNextPlanDay;

public class GetNextPlanDayQueryHandler(IApplicationDbContext dbContext)
    : IRequestHandler<GetNextPlanDayQuery, PlanDaySummaryResponse?>
{
    public async Task<PlanDaySummaryResponse?> Handle(
        GetNextPlanDayQuery request, CancellationToken cancellationToken)
    {
        // One plan at a time, chosen explicitly. Two creates racing from different
        // devices can each believe they are the user's first and both come out active;
        // reading every active plan at once would then blend two programmes into one
        // rotation and suggest days that belong together in neither.
        var activePlanId = await dbContext.TrainingPlans
            .Where(p => p.UserId == request.UserId && p.IsActive)
            .OrderBy(p => p.CreatedAt)
            .Select(p => (Guid?)p.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (activePlanId is null)
        {
            return null;
        }

        var days = await dbContext.TrainingPlanDays
            .Where(d => d.PlanId == activePlanId)
            .OrderBy(d => d.OrderIndex)
            .Select(d => new PlanDaySummaryResponse(d.Id, d.Name, d.OrderIndex, d.Exercises.Count))
            .ToListAsync(cancellationToken);

        if (days.Count == 0)
        {
            return null;
        }

        var dayIds = days.Select(d => d.Id).ToList();

        // Where the user is in the rotation, judged by the most recent session that
        // came from this plan. Ordering by PerformedAt alone would be ambiguous when
        // two days share a date, so CreatedAt breaks the tie.
        var lastDayId = await dbContext.Workouts
            .Where(w => w.UserId == request.UserId && w.PlanDayId != null && dayIds.Contains(w.PlanDayId.Value))
            .OrderByDescending(w => w.PerformedAt)
            .ThenByDescending(w => w.CreatedAt)
            .Select(w => w.PlanDayId)
            .FirstOrDefaultAsync(cancellationToken);

        if (lastDayId is null)
        {
            return days[0];
        }

        var lastIndex = days.FindIndex(d => d.Id == lastDayId.Value);

        return lastIndex < 0 ? days[0] : days[(lastIndex + 1) % days.Count];
    }
}
