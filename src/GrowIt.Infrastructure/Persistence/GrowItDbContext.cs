using GrowIt.Application.Common.Exceptions;
using GrowIt.Application.Common.Interfaces;
using GrowIt.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace GrowIt.Infrastructure.Persistence;

public class GrowItDbContext(DbContextOptions<GrowItDbContext> options) : DbContext(options), IApplicationDbContext
{
    public DbSet<Exercise> Exercises => Set<Exercise>();
    public DbSet<Workout> Workouts => Set<Workout>();
    public DbSet<WorkoutExercise> WorkoutExercises => Set<WorkoutExercise>();
    public DbSet<Set> Sets => Set<Set>();
    public DbSet<TrainingPlan> TrainingPlans => Set<TrainingPlan>();
    public DbSet<TrainingPlanDay> TrainingPlanDays => Set<TrainingPlanDay>();
    public DbSet<TrainingPlanDayExercise> TrainingPlanDayExercises => Set<TrainingPlanDayExercise>();

    /// Turns a duplicate-key violation into something the caller can act on.
    ///
    /// Handlers check whether a client-supplied id is already taken before inserting,
    /// but two concurrent retries can both pass that check and race to the insert.
    /// Whoever loses would otherwise surface as a 500 - which an offline client reads
    /// as "try again", forever. A conflict says the row is there now: stop and refetch.
    /// Postgres is this layer's business, so the translation belongs here rather than
    /// leaking a driver dependency up into Application.
    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            return await base.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception)
            when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new ConflictException("A row with this id already exists.", exception);
        }
        catch (DbUpdateException exception)
            when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.ForeignKeyViolation })
        {
            // Something the write points at is not there - a library exercise that has
            // since been removed, a parent whose own write never landed. Left unmapped
            // this surfaced as a 500, which a queued write reads as "try again" and then
            // does, forever.
            throw new NotFoundException("A row this write refers to does not exist.");
        }
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var seededAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        modelBuilder.Entity<Exercise>().HasData(
            // Klatka
            new Exercise { Id = Guid.Parse("a1b2c3d4-0001-0000-0000-000000000000"), Name = "Wyciskanie sztangi", Category = "Klatka", MuscleGroup = "Klatka piersiowa", CreatedAt = seededAt },
            new Exercise { Id = Guid.Parse("a1b2c3d4-0002-0000-0000-000000000000"), Name = "Wyciskanie hantli", Category = "Klatka", MuscleGroup = "Klatka piersiowa", CreatedAt = seededAt },
            new Exercise { Id = Guid.Parse("a1b2c3d4-0003-0000-0000-000000000000"), Name = "Rozpiętki", Category = "Klatka", MuscleGroup = "Klatka piersiowa", CreatedAt = seededAt },
            // Plecy
            new Exercise { Id = Guid.Parse("a1b2c3d4-0004-0000-0000-000000000000"), Name = "Martwy ciąg", Category = "Plecy", MuscleGroup = "Plecy", CreatedAt = seededAt },
            new Exercise { Id = Guid.Parse("a1b2c3d4-0005-0000-0000-000000000000"), Name = "Wiosłowanie sztangą", Category = "Plecy", MuscleGroup = "Plecy", CreatedAt = seededAt },
            new Exercise { Id = Guid.Parse("a1b2c3d4-0006-0000-0000-000000000000"), Name = "Podciąganie", Category = "Plecy", MuscleGroup = "Plecy", CreatedAt = seededAt },
            // Nogi
            new Exercise { Id = Guid.Parse("a1b2c3d4-0007-0000-0000-000000000000"), Name = "Przysiad ze sztangą", Category = "Nogi", MuscleGroup = "Nogi", CreatedAt = seededAt },
            new Exercise { Id = Guid.Parse("a1b2c3d4-0008-0000-0000-000000000000"), Name = "Wypychanie nogami", Category = "Nogi", MuscleGroup = "Nogi", CreatedAt = seededAt },
            new Exercise { Id = Guid.Parse("a1b2c3d4-0009-0000-0000-000000000000"), Name = "Wykroki", Category = "Nogi", MuscleGroup = "Nogi", CreatedAt = seededAt },
            // Barki
            new Exercise { Id = Guid.Parse("a1b2c3d4-0010-0000-0000-000000000000"), Name = "Wyciskanie żołnierskie", Category = "Barki", MuscleGroup = "Barki", CreatedAt = seededAt },
            new Exercise { Id = Guid.Parse("a1b2c3d4-0011-0000-0000-000000000000"), Name = "Unoszenie bokiem", Category = "Barki", MuscleGroup = "Barki", CreatedAt = seededAt },
            new Exercise { Id = Guid.Parse("a1b2c3d4-0012-0000-0000-000000000000"), Name = "Unoszenie przodem", Category = "Barki", MuscleGroup = "Barki", CreatedAt = seededAt },
            // Triceps
            new Exercise { Id = Guid.Parse("a1b2c3d4-0013-0000-0000-000000000000"), Name = "Wyciskanie wąskim chwytem", Category = "Triceps", MuscleGroup = "Triceps", CreatedAt = seededAt },
            new Exercise { Id = Guid.Parse("a1b2c3d4-0014-0000-0000-000000000000"), Name = "Prostowanie ramion na wyciągu", Category = "Triceps", MuscleGroup = "Triceps", CreatedAt = seededAt },
            // Biceps
            new Exercise { Id = Guid.Parse("a1b2c3d4-0015-0000-0000-000000000000"), Name = "Uginanie ramion ze sztangą", Category = "Biceps", MuscleGroup = "Biceps", CreatedAt = seededAt },
            new Exercise { Id = Guid.Parse("a1b2c3d4-0016-0000-0000-000000000000"), Name = "Uginanie ramion z hantlami", Category = "Biceps", MuscleGroup = "Biceps", CreatedAt = seededAt }
        );
    }
}
