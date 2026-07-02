package employees

import (
	"certification-system/utils"

	"gorm.io/gorm"
)

type EmployeeRepository interface {
	FindAll(params utils.PaginationParam) ([]Employee, *utils.Pagination, error)
	FindByNIK(nik string) (Employee, error)
	FindByID(id uint) (Employee, error)
	Create(emp *Employee) error
	Update(emp *Employee) error
	Delete(id uint) error
	FindAllWithoutPagination() ([]Employee, error)
}

type employeeRepository struct {
	db *gorm.DB
}

func NewEmployeeRepository(db *gorm.DB) EmployeeRepository {
	return &employeeRepository{db: db}
}

func (r *employeeRepository) FindAll(param utils.PaginationParam) ([]Employee, *utils.Pagination, error) {
	var emp []Employee

	query := r.db.Model(&Employee{})

	if param.Search != "" {
		query = query.Where(
			"nik LIKE ? OR name LIKE ? OR dept LIKE ? OR type_employee LIKE ?",
			"%"+param.Search+"%",
			"%"+param.Search+"%",
			"%"+param.Search+"%",
			"%"+param.Search+"%",
		)
	}
	pagination, err := utils.Paginate(query, param, &emp)
	if err != nil {
		return nil, nil, err
	}

	return emp, pagination, nil
}

func (r *employeeRepository) FindAllWithoutPagination() ([]Employee, error) {
	var employees []Employee
	err := r.db.Order("id ASC").Find(&employees).Error
	return employees, err
}

func (r *employeeRepository) FindByNIK(nik string) (Employee, error) {
	var emp Employee
	err := r.db.Where("nik = ?", nik).First(&emp).Error
	return emp, err
}

func (r *employeeRepository) FindByID(id uint) (Employee, error) {
	var emp Employee
	err := r.db.First(&emp, id).Error
	return emp, err
}

func (r *employeeRepository) Create(emp *Employee) error {
	return r.db.Create(emp).Error
}

func (r *employeeRepository) Update(emp *Employee) error {
	return r.db.Save(&emp).Error
}

func (r *employeeRepository) Delete(id uint) error {
	return r.db.Delete(&Employee{}, id).Error
}
