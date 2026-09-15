using FluentValidation;

namespace GrowIt.Application.Workouts.Queries.GetWorkoutHistory;

public class GetWorkoutHistoryQueryValidator : AbstractValidator<GetWorkoutHistoryQuery>
{
    /// Enough for any screen that pages, low enough that a stray query string cannot ask
    /// the database for someone's entire history in one go.
    private const int MaxPageSize = 100;

    public GetWorkoutHistoryQueryValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();

        // Page numbering starts at one. Zero reached Skip((page - 1) * pageSize) as a
        // negative offset, which Postgres refuses outright - a 500 from a query string.
        RuleFor(x => x.Page).GreaterThan(0);
        RuleFor(x => x.PageSize).GreaterThan(0).LessThanOrEqualTo(MaxPageSize);
    }
}
