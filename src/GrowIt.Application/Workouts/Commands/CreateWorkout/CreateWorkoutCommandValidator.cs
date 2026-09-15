using FluentValidation;

namespace GrowIt.Application.Workouts.Commands.CreateWorkout;

public class CreateWorkoutCommandValidator : AbstractValidator<CreateWorkoutCommand>
{
    public CreateWorkoutCommandValidator()
    {
        // The client names the row, so an id is part of the request rather than something
        // we hand back. A record's Guid defaults to empty when the field is simply absent
        // from the body, and empty is an id like any other to the idempotency check: the
        // first caller to use it quietly folds every later write into that one row, and
        // everyone else is refused forever.
        RuleFor(x => x.Id).NotEmpty();

        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.PerformedAt).NotEmpty();
    }
}
