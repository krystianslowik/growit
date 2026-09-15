using FluentValidation;
using GrowIt.Contracts.Workouts.Requests;

namespace GrowIt.Application.Workouts.Commands.CreateWorkoutFromPlanDay;

public class CreateWorkoutFromPlanDayCommandValidator : AbstractValidator<CreateWorkoutFromPlanDayCommand>
{
    public CreateWorkoutFromPlanDayCommandValidator()
    {
        // The client names the row, so an id is part of the request rather than something
        // we hand back. A record's Guid defaults to empty when the field is simply absent
        // from the body, and empty is an id like any other to the idempotency check: the
        // first caller to use it quietly folds every later write into that one row, and
        // everyone else is refused forever.
        RuleFor(x => x.Id).NotEmpty();

        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.PlanDayId).NotEmpty();
        RuleFor(x => x.PerformedAt).NotEmpty();

        // Each copied row is named once, on both sides. Without this a repeated key blew
        // up inside the handler as a 500 - a permanent failure dressed as a temporary one,
        // which the offline queue would retry without end.
        RuleForEach(x => x.ExerciseIds).ChildRules(assignment =>
        {
            assignment.RuleFor(a => a.PlanDayExerciseId).NotEmpty();
            assignment.RuleFor(a => a.WorkoutExerciseId).NotEmpty();
        });

        RuleFor(x => x.ExerciseIds)
            .Must(NamesEachRowOnce)
            .WithMessage("Each plan day exercise may be mapped once, to an id of its own");
    }

    private static bool NamesEachRowOnce(IReadOnlyList<WorkoutExerciseIdAssignment> assignments)
    {
        var sources = assignments.Select(a => a.PlanDayExerciseId).ToList();
        var targets = assignments.Select(a => a.WorkoutExerciseId).ToList();

        return sources.Count == sources.Distinct().Count()
            && targets.Count == targets.Distinct().Count();
    }
}
