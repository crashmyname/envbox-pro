package migration

import (
	"certification-system/database"
	"certification-system/modules/certificate"
	"certification-system/modules/employees"
	"certification-system/modules/users"
	"log"
)

func AutoMigrate() {
	err := database.DB.AutoMigrate(
		&users.User{},
		&employees.Employee{},
		&certificate.CertificateApplication{},
		// Tambah model lain di sini
	)
	if err != nil {
		log.Fatal("Gagal melakukan migrasi:", err)
	}
	log.Println("Migrasi berhasil!")
}
