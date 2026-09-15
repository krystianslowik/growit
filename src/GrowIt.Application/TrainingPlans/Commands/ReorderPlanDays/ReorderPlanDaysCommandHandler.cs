using FluentValidation;
using GrowIt.Application.Common.Exceptions;
using GrowIt.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GrowIt.Application.TrainingPlans.Commands.ReorderPlanDays;

public class ReorderPlanDaysCommandHandler(IApplicationDbContext dbContext)
    : IRequestHandler<ReorderPlanDaysCommand>
{
    public async Task Handle(ReorderPlanDaysCommand request, CancellationToken cancellationToken)
    {
        var days = await dbContext.TrainingPlanDays
            .Where(d => d.PlanId == request.PlanId && d.Plan.UserId == request.UserId)
            .ToListAsync(cancellationToken);

        if (days.Count == 0)
        {
            throw new NotFoundException($"Training plan {request.PlanId} not found");
        }

        // Reject a partial list outright: applying it would silently leave the days
        // it omits sharing positions with the ones it moves.
        var submitted = request.DayIds.ToHashSet();
        if (submitted.Count != request.DayIds.Count || !days.All(d => submitted.Contains(d.Id))
            || submitted.Count != days.Count)
        {
            // Not a 500: the request will never be right, and saying so as a server
            // error would have the client retry it until its budget ran out.
            throw new ValidationException("The order must list every day of the plan exactly once");
        }

        for (var index = 0; index < request.DayIds.Count; index++)
        {
            days.First(d => d.Id == request.DayIds[index]).OrderIndex = index;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
