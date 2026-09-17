const columnType = document.getElementById('columnType');

columnType.addEventListener('change', function () {
    document.getElementById('column-cylindrical-options').style.display =
        this.value === 'cylindrical' ? 'block' : 'none';

    document.getElementById('column-square-options').style.display =
        this.value === 'cylindrical' ? 'none' : 'block';
});

columnType.dispatchEvent(new Event('change'));
