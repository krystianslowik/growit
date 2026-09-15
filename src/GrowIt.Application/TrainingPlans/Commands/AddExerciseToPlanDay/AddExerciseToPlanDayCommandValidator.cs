using FluentValidation;

namespace GrowIt.Application.TrainingPlans.Commands.AddExerciseToPlanDay;

public class AddExerciseToPlanDayCommandValidator : AbstractValidator<AddExerciseToPlanDayCommand>
{
    public AddExerciseToPlanDayCommandValidator()
    {
        // The client names the row, so an id is part of the request rather than something
        // we hand back. A record's Guid defaults to empty when the field is simply absent
        // from the body, and empty is an id like any other to the idempotency check: the
        // first caller to use it quietly folds every later write into that one row, and
        // everyone else is refused forever.
        RuleFor(x => x.Id).NotEmpty();

        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.PlanDayId).NotEmpty();
        RuleFor(x => x.TargetSets).GreaterThan(0);
        RuleFor(x => x.TargetReps).GreaterThan(0);
        RuleFor(x => x.RestSeconds).GreaterThanOrEqualTo(0);

        // An exercise is either picked from the library or typed in by hand.
        RuleFor(x => x)
            .Must(x => x.ExerciseId.HasValue ^ !string.IsNullOrWhiteSpace(x.CustomExerciseName))
            .WithMessage("Provide either ExerciseId or CustomExerciseName, not both");
    }
}
