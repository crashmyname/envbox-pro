package employees

import "time"

type Employee struct {
	ID           uint      `json:"id" gorm:"primaryKey;column:id"`
	NIK          string    `json:"nik" gorm:"unqiueKey"`
	Name         string    `json:"name"`
	Department   string    `json:"dept"`
	TypeEmployee string    `json:"type_employee"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
