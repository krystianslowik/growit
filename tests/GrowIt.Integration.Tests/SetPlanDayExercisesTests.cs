using GrowIt.Application.Common.Exceptions;
using GrowIt.Application.TrainingPlans.Commands.SetPlanDayExercises;
using GrowIt.Domain.Entities;
using GrowIt.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GrowIt.Integration.Tests;

/// Exercises the declarative "set the day's exercises" command against the local
/// Postgres from docker-compose. Each test builds and tears down its own plan.
public class SetPlanDayExercisesTests : IAsyncLifetime
{
    private const string ConnectionString =
        "Host=localhost;Port=5432;Database=growit;Username=growit;Password=localdev";

    private static readonly Guid BenchPress = Guid.Parse("a1b2c3d4-0001-0000-0000-000000000000");
    private static readonly Guid DumbbellPress = Guid.Parse("a1b2c3d4-0002-0000-0000-000000000000");
    private static readonly Guid Deadlift = Guid.Parse("a1b2c3d4-0004-0000-0000-000000000000");

    private readonly Guid _userId = Guid.NewGuid();
    private Guid _planId;
    private readonly Guid _otherPlanId = Guid.CreateVersion7();
    private Guid _dayId;
    private Guid _benchRowId;
    private Guid _dumbbellRowId;

    private static GrowItDbContext NewContext() =>
        new(new DbContextOptionsBuilder<GrowItDbContext>().UseNpgsql(ConnectionString).Options);

    public async ValueTask InitializeAsync()
    {
        await using var db = NewContext();

        _planId = Guid.NewGuid();
        _dayId = Guid.NewGuid();
        _benchRowId = Guid.NewGuid();
        _dumbbellRowId = Guid.NewGuid();

        db.TrainingPlans.Add(new TrainingPlan
        {
            Id = _planId,
            UserId = _userId,
            Name = "Test plan",
            CreatedAt = DateTime.UtcNow,
            Days =
            {
                new TrainingPlanDay
                {
                    Id = _dayId,
                    Name = "Push",
                    OrderIndex = 0,
                    CreatedAt = DateTime.UtcNow,
                    Exercises =
                    {
                        // Tuned away from the defaults - this is what must survive.
                        new TrainingPlanDayExercise
                        {
                            Id = _benchRowId, ExerciseId = BenchPress,
                            TargetSets = 5, TargetReps = 5, RestSeconds = 180, OrderIndex = 0
                        },
                        new TrainingPlanDayExercise
                        {
                            Id = _dumbbellRowId, ExerciseId = DumbbellPress,
                            TargetSets = 3, TargetReps = 10, RestSeconds = 90, OrderIndex = 1
                        }
                    }
                }
            }
        });

        await db.SaveChangesAsync();
    }

    public async ValueTask DisposeAsync()
    {
        await using var db = NewContext();
        var plans = await db.TrainingPlans
            .Where(p => p.Id == _planId || p.Id == _otherPlanId)
            .ToListAsync();

        if (plans.Count != 0)
        {
            db.TrainingPlans.RemoveRange(plans);
            await db.SaveChangesAsync();
        }
    }

    /// A row living on a different plan entirely, for the conflict case. Torn down in
    /// DisposeAsync along with the plan that owns it.
    private async Task<Guid> CreateRowOnAnotherDayAsync()
    {
        await using var db = NewContext();

        var rowId = Guid.CreateVersion7();
        db.TrainingPlans.Add(new TrainingPlan
        {
            Id = _otherPlanId,
            UserId = _userId,
            Name = "Other plan",
            CreatedAt = DateTime.UtcNow,
            Days =
            {
                new TrainingPlanDay
                {
                    Id = Guid.CreateVersion7(),
                    Name = "Pull",
                    OrderIndex = 0,
                    CreatedAt = DateTime.UtcNow,
                    Exercises =
                    {
                        new TrainingPlanDayExercise
                        {
                            Id = rowId, ExerciseId = BenchPress,
                            TargetSets = 3, TargetReps = 10, RestSeconds = 90, OrderIndex = 0
                        }
                    }
                }
            }
        });

        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        return rowId;
    }

    private async Task<List<TrainingPlanDayExercise>> ReadDayAsync()
    {
        await using var db = NewContext();
        return await db.TrainingPlanDayExercises
            .Where(e => e.PlanDayId == _dayId)
            .OrderBy(e => e.OrderIndex)
            .ToListAsync(TestContext.Current.CancellationToken);
    }

    private async Task RunAsync(params PlanDayExerciseSelectionInput[] selections)
    {
        await using var db = NewContext();
        var handler = new SetPlanDayExercisesCommandHandler(db);
        await handler.Handle(
            new SetPlanDayExercisesCommand(_userId, _dayId, selections), TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task Applies_the_desired_list_keeping_tuned_targets_and_dropping_the_rest()
    {
        await RunAsync(
            new PlanDayExerciseSelectionInput(_benchRowId, null, null),
            new PlanDayExerciseSelectionInput(null, Deadlift, null),
            new PlanDayExerciseSelectionInput(null, null, "Pompki na poręczach"));

        var rows = await ReadDayAsync();

        Assert.Equal(3, rows.Count);

        // Kept row keeps its id and the targets the user tuned.
        Assert.Equal(_benchRowId, rows[0].Id);
        Assert.Equal(5, rows[0].TargetSets);
        Assert.Equal(180, rows[0].RestSeconds);

        // New library pick starts on the defaults.
        Assert.Equal(Deadlift, rows[1].ExerciseId);
        Assert.Equal(3, rows[1].TargetSets);
        Assert.Equal(10, rows[1].TargetReps);
        Assert.Equal(90, rows[1].RestSeconds);

        Assert.Null(rows[2].ExerciseId);
        Assert.Equal("Pompki na poręczach", rows[2].CustomExerciseName);

        // The one left out of the list is gone.
        Assert.DoesNotContain(rows, r => r.Id == _dumbbellRowId);
    }

    [Fact]
    public async Task Sending_the_same_list_twice_changes_nothing()
    {
        var selections = new[]
        {
            new PlanDayExerciseSelectionInput(_benchRowId, null, null),
            new PlanDayExerciseSelectionInput(null, Deadlift, null),
            new PlanDayExerciseSelectionInput(null, null, "Pompki na poręczach")
        };

        await RunAsync(selections);
        var first = await ReadDayAsync();

        // A retry after a dropped response must not duplicate or churn row ids.
        await RunAsync(selections);
        var second = await ReadDayAsync();

        Assert.Equal(first.Select(r => r.Id), second.Select(r => r.Id));
        Assert.Equal(first.Select(r => r.OrderIndex), second.Select(r => r.OrderIndex));
    }

    [Fact]
    public async Task Position_in_the_list_becomes_the_order()
    {
        await RunAsync(
            new PlanDayExerciseSelectionInput(_dumbbellRowId, null, null),
            new PlanDayExerciseSelectionInput(_benchRowId, null, null));

        var rows = await ReadDayAsync();

        Assert.Equal(new[] { _dumbbellRowId, _benchRowId }, rows.Select(r => r.Id));
        Assert.Equal(new[] { 0, 1 }, rows.Select(r => r.OrderIndex));
    }

    [Fact]
    public async Task An_empty_list_clears_the_day()
    {
        await RunAsync();
        Assert.Empty(await ReadDayAsync());
    }

    [Fact]
    public async Task Rejects_a_row_id_that_names_nothing_we_can_create()
    {
        // An unknown id with no exercise behind it is not something we can act on:
        // the caller is pointing at a row that does not exist.
        await Assert.ThrowsAsync<NotFoundException>(() =>
            RunAsync(new PlanDayExerciseSelectionInput(Guid.NewGuid(), null, null)));
    }

    [Fact]
    public async Task Creates_a_row_using_the_id_the_client_picked()
    {
        // How a day edited offline arrives: the client minted the id so it could show
        // and edit the row before the server ever heard about it.
        var clientId = Guid.CreateVersion7();

        await RunAsync(
            new PlanDayExerciseSelectionInput(_benchRowId, null, null),
            new PlanDayExerciseSelectionInput(clientId, Deadlift, null));

        var rows = await ReadDayAsync();

        Assert.Equal(2, rows.Count);
        Assert.Equal(clientId, rows[1].Id);
        Assert.Equal(Deadlift, rows[1].ExerciseId);
    }

    [Fact]
    public async Task Replaying_a_client_id_does_not_duplicate_the_row()
    {
        var clientId = Guid.CreateVersion7();
        var selections = new[]
        {
            new PlanDayExerciseSelectionInput(_benchRowId, null, null),
            new PlanDayExerciseSelectionInput(clientId, Deadlift, null)
        };

        await RunAsync(selections);
        await RunAsync(selections);

        var rows = await ReadDayAsync();

        Assert.Equal(2, rows.Count);
        Assert.Single(rows, r => r.Id == clientId);
    }

    [Fact]
    public async Task A_fresh_id_for_an_exercise_the_day_already_has_keeps_the_tuned_row()
    {
        // What a second device does when its copy of the day is out of date: it mints an id
        // for an exercise the day already holds. Honouring that id would drop the bench row
        // and rebuild it on the defaults, losing the 5x5x180 the user set on another phone.
        await RunAsync(
            new PlanDayExerciseSelectionInput(Guid.CreateVersion7(), BenchPress, null),
            new PlanDayExerciseSelectionInput(_dumbbellRowId, null, null));

        var rows = await ReadDayAsync();

        Assert.Equal(2, rows.Count);
        Assert.Equal(_benchRowId, rows[0].Id);
        Assert.Equal(5, rows[0].TargetSets);
        Assert.Equal(180, rows[0].RestSeconds);
    }

    [Fact]
    public async Task Refuses_an_id_that_already_belongs_to_another_day()
    {
        // Taking over a row that exists elsewhere is the one thing client-supplied ids
        // must never make possible, so it has to fail loudly rather than move the row.
        var strangerRowId = await CreateRowOnAnotherDayAsync();

        await Assert.ThrowsAsync<ConflictException>(() =>
            RunAsync(new PlanDayExerciseSelectionInput(strangerRowId, Deadlift, null)));

        // And the row it pointed at is untouched.
        await using var db = NewContext();
        var stranger = await db.TrainingPlanDayExercises.FirstAsync(e => e.Id == strangerRowId, TestContext.Current.CancellationToken);
        Assert.NotEqual(_dayId, stranger.PlanDayId);
    }
}
