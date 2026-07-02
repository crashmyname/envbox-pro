package utils

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Pagination struct {
	Page       int         `json:"page"`
	Limit      int         `json:"limit"`
	TotalRows  int64       `json:"total_rows"`
	TotalPages int         `json:"total_pages"`
	Data       interface{} `json:"data,omitempty"`
}

type PaginationParam struct {
	Page   int
	Limit  int
	Offset int
	Search string
	Sort   string
	Filter map[string]string
}

func GetPaginationParams(c *gin.Context) PaginationParam {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	search := c.DefaultQuery("search", "")
	sort := c.DefaultQuery("sort", "id desc")

	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}

	offset := (page - 1) * limit

	filter := make(map[string]string)
	for key, values := range c.Request.URL.Query() {
		if key != "page" && key != "limit" && key != "search" && key != "sort" {
			if len(values) > 0 {
				filter[key] = values[0]
			}
		}
	}

	return PaginationParam{
		Page:   page,
		Limit:  limit,
		Offset: offset,
		Search: search,
		Sort:   sort,
		Filter: filter,
	}
}

func Paginate(db *gorm.DB, param PaginationParam, result interface{}) (*Pagination, error) {
	var totalRows int64

	for key, value := range param.Filter {
		db = db.Where(key+" = ?", value)
	}

	if param.Search != "" {
		db = db.Where("name LIKE ?", "%"+param.Search+"%")
	}

	if err := db.Count(&totalRows).Error; err != nil {
		return nil, err
	}

	if param.Sort != "" {
		parts := strings.Split(param.Sort, " ")
		if len(parts) == 2 {
			field, order := parts[0], strings.ToUpper(parts[1])
			if order == "ASC" || order == "DESC" {
				db = db.Order(field + " " + order)
			}
		}
	}

	if err := db.Offset(param.Offset).Limit(param.Limit).Find(result).Error; err != nil {
		return nil, err
	}

	totalPages := int(totalRows) / param.Limit
	if int(totalRows)%param.Limit != 0 {
		totalPages++
	}

	return &Pagination{
		Page:       param.Page,
		Limit:      param.Limit,
		TotalRows:  totalRows,
		TotalPages: totalPages,
	}, nil
}
