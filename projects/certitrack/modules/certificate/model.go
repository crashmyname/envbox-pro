package certificate

import (
	"encoding/json"
	"time"
)

type CertificateApplication struct {
	ID               uint       `json:"id" gorm:"primaryKey;column:id"`
	NIK              string     `json:"nik" gorm:"uniqueKey"`
	Name             string     `json:"name"`
	Certificate      string     `json:"certificate"`
	TrainingDate     time.Time  `json:"training_date" gorm:"type:date"`
	AttachAbsance    string     `json:"attendance_file" gorm:"type:varchar(255)"`
	WrittenTestFile  string     `json:"written_test_file" gorm:"type:varchar(255)"`
	PracticeTestFile string     `json:"practice_test_file" gorm:"type:varchar(255)"`
	EyeTestFile      string     `json:"eye_test_file" gorm:"type:varchar(255)"`
	ExpDate          *time.Time `json:"exp_date" gorm:"type:date"`
	Status           string     `json:"status" gorm:"type:varchar(20);default:'Draft'"`
	Reason           string     `json:"reason"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

func (c CertificateApplication) MarshalJSON() ([]byte, error) {
	type Alias CertificateApplication
	return json.Marshal(&struct {
		TrainingDate string  `json:"training_date"`
		ExpDate      *string `json:"exp_date"`
		*Alias
	}{
		TrainingDate: c.TrainingDate.Format("2006-01-02"),
		ExpDate:      formatExpDate(c.ExpDate),
		Alias:        (*Alias)(&c),
	})
}

func formatExpDate(d *time.Time) *string {
	if d == nil {
		return nil
	}
	s := d.Format("2006-01-02")
	return &s
}
