allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

subprojects {
    project.tasks.configureEach {
        if (name.contains("compile") && name.contains("Kotlin")) {
            try {
                val task = this as? org.jetbrains.kotlin.gradle.tasks.KotlinCompile
                task?.compilerOptions?.freeCompilerArgs?.add("-Xskip-metadata-version-check")
            } catch (_: Exception) {}
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
