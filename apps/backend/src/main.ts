import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.setGlobalPrefix("api");
  // The frontend calls this API directly from the browser (different port =
  // different origin), so it needs an explicit CORS allow — otherwise every
  // request silently fails in the browser even though curl/server-to-server
  // calls work fine.
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:3000" });

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen(port, host);
}

bootstrap();
