using System.Text.Json.Serialization;
using GrowIt.API.Middleware;
using GrowIt.Application;
using GrowIt.Infrastructure;
using GrowIt.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// Strict, so numbers are numbers on the wire and in the OpenAPI document. The web
// default also accepts numeric strings, which .NET 10 publishes as integer|string and
// the generated client would type as number | string. MVC and the OpenAPI generator
// read separate options, so both are set.
builder.Services.AddControllers()
    .AddJsonOptions(options => options.JsonSerializerOptions.NumberHandling = JsonNumberHandling.Strict);
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict);
builder.Services.AddOpenApi();

builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddProblemDetails();

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

var cognitoAuthority = builder.Configuration["Cognito:Authority"]
    ?? throw new InvalidOperationException("Cognito:Authority is not configured");
var cognitoClientId = builder.Configuration["Cognito:ClientId"]
    ?? throw new InvalidOperationException("Cognito:ClientId is not configured");

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = cognitoAuthority;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = cognitoAuthority,
            ValidateAudience = false,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
        };

        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = context =>
            {
                var principal = context.Principal;

                if (principal?.FindFirst("token_use")?.Value != "access")
                {
                    context.Fail("Expected an access token");
                    return Task.CompletedTask;
                }

                if (principal.FindFirst("client_id")?.Value != cognitoClientId)
                {
                    context.Fail("Token was issued for a different app client");
                }

                return Task.CompletedTask;
            },
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<GrowItDbContext>();
    await db.Database.MigrateAsync();
}

// First in the pipeline, so nothing downstream can escape as a bare 500.
app.UseExceptionHandler();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();

/// Named so the test host can boot the real pipeline - validation, exception mapping,
/// controllers and all - rather than calling handlers directly and missing every layer
/// this file puts in front of them.
public partial class Program;
