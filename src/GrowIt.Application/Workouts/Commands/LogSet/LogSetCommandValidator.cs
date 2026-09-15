using FluentValidation;

namespace GrowIt.Application.Workouts.Commands.LogSet;

public class LogSetCommandValidator : AbstractValidator<LogSetCommand>
{
    public LogSetCommandValidator()
    {
        // See CreateTrainingPlanCommandValidator: a missing id in the body arrives as
        // Guid.Empty, and the idempotency check cannot tell that apart from a real one.
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.WorkoutExerciseId).NotEmpty();

        // A set that was not lifted is not a set; negatives are nonsense either way.
        RuleFor(x => x.Reps).GreaterThan(0);
        RuleFor(x => x.WeightKg).GreaterThanOrEqualTo(0);
        RuleFor(x => x.OrderIndex).GreaterThanOrEqualTo(0);
    }
}
